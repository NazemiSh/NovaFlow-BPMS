using System.Data;
using System.Data.Common;
using System.Globalization;
using System.IO.Compression;
using System.Text.Encodings.Web;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public class BackupService : IBackupService
{
    private readonly ApplicationDbContext _context;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<BackupService> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        PropertyNameCaseInsensitive = true
    };

    public BackupService(ApplicationDbContext context, IWebHostEnvironment env, ILogger<BackupService> logger)
    {
        _context = context;
        _env = env;
        _logger = logger;
    }

    public string GetResolvedStoragePath(string? customPath = null)
    {
        if (!string.IsNullOrWhiteSpace(customPath))
        {
            if (Path.IsPathRooted(customPath))
                return customPath;
            return Path.GetFullPath(Path.Combine(_env.ContentRootPath, customPath));
        }

        var defaultPath = Path.Combine(_env.ContentRootPath, "App_Data", "Backups");
        if (!Directory.Exists(defaultPath))
        {
            Directory.CreateDirectory(defaultPath);
        }
        return defaultPath;
    }

    private string GetUploadsPath()
    {
        var webRoot = _env.WebRootPath ?? Path.Combine(_env.ContentRootPath, "wwwroot");
        var uploads = Path.Combine(webRoot, "uploads");
        if (!Directory.Exists(uploads))
        {
            Directory.CreateDirectory(uploads);
        }
        return uploads;
    }

    public async Task<byte[]> CreateBackupZipAsync(List<string> modules, string? customNote = null, string backupType = "Manual")
    {
        var now = DateTime.UtcNow;
        var nowPersian = ToPersianDateTime(DateTime.Now);

        var manifest = new BackupManifest
        {
            BackupVersion = "1.0",
            SystemVersion = "1.0.0",
            CreatedAtUtc = now,
            CreatedAtPersian = nowPersian,
            BackupType = backupType,
            CustomNote = customNote,
            Modules = modules
        };

        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
        {
            // ۱. کاربران، نقش‌ها و گروه‌های سازمانی
            if (modules.Contains("users", StringComparer.OrdinalIgnoreCase))
            {
                var roles = await _context.AppRoles.AsNoTracking().ToListAsync();
                var users = await _context.AppUsers.AsNoTracking().ToListAsync();
                var userRoles = await _context.AppUserRoles.AsNoTracking().ToListAsync();
                var groups = await _context.UserGroups.AsNoTracking().ToListAsync();
                var groupMembers = await _context.UserGroupMembers.AsNoTracking().ToListAsync();

                await AddJsonEntryAsync(archive, "AppRoles.json", roles);
                await AddJsonEntryAsync(archive, "AppUsers.json", users);
                await AddJsonEntryAsync(archive, "AppUserRoles.json", userRoles);
                await AddJsonEntryAsync(archive, "UserGroups.json", groups);
                await AddJsonEntryAsync(archive, "UserGroupMembers.json", groupMembers);

                manifest.ItemCounts["AppRoles"] = roles.Count;
                manifest.ItemCounts["AppUsers"] = users.Count;
                manifest.ItemCounts["AppUserRoles"] = userRoles.Count;
                manifest.ItemCounts["UserGroups"] = groups.Count;
                manifest.ItemCounts["UserGroupMembers"] = groupMembers.Count;
                manifest.ModuleSummaries["users"] = $"{users.Count} کاربر، {roles.Count} نقش، {groups.Count} گروه";
            }

            // ۲. تعاریف فرم‌ها و دسترسی گروه‌ها
            if (modules.Contains("forms", StringComparer.OrdinalIgnoreCase))
            {
                var forms = await _context.Forms.AsNoTracking().ToListAsync();
                var formAccess = await _context.FormGroupAccesses.AsNoTracking().ToListAsync();

                await AddJsonEntryAsync(archive, "Forms.json", forms);
                await AddJsonEntryAsync(archive, "FormGroupAccess.json", formAccess);

                manifest.ItemCounts["Forms"] = forms.Count;
                manifest.ItemCounts["FormGroupAccess"] = formAccess.Count;
                manifest.ModuleSummaries["forms"] = $"{forms.Count} فرم سازمانی";
            }

            // ۳. درخواست‌های ثبت‌شده، کارتابل، رونوشت‌ها و تاریخچه گردش‌کار
            if (modules.Contains("data", StringComparer.OrdinalIgnoreCase))
            {
                var submissions = await _context.FormSubmissions.AsNoTracking().ToListAsync();
                var shares = await _context.FormShares.AsNoTracking().ToListAsync();
                var history = await _context.WorkflowHistory.AsNoTracking().ToListAsync();

                await AddJsonEntryAsync(archive, "FormSubmissions.json", submissions);
                await AddJsonEntryAsync(archive, "FormShares.json", shares);
                await AddJsonEntryAsync(archive, "WorkflowHistory.json", history);

                manifest.ItemCounts["FormSubmissions"] = submissions.Count;
                manifest.ItemCounts["FormShares"] = shares.Count;
                manifest.ItemCounts["WorkflowHistory"] = history.Count;
                manifest.ModuleSummaries["data"] = $"{submissions.Count} درخواست، {history.Count} لاگ گردش‌کار";
            }

            // ۴. تنظیمات سامانه، اکتیو دایرکتوری و هوش مصنوعی
            if (modules.Contains("settings", StringComparer.OrdinalIgnoreCase))
            {
                var settings = await _context.SystemSettings.AsNoTracking().ToListAsync();
                var aiConfigs = await _context.AiConfigurations.AsNoTracking().ToListAsync();

                await AddJsonEntryAsync(archive, "SystemSettings.json", settings);
                await AddJsonEntryAsync(archive, "AiConfigurations.json", aiConfigs);

                manifest.ItemCounts["SystemSettings"] = settings.Count;
                manifest.ItemCounts["AiConfigurations"] = aiConfigs.Count;
                manifest.ModuleSummaries["settings"] = $"{settings.Count} تنظیم سامانه، {aiConfigs.Count} پیکربندی AI";
            }

            // ۵. فایل‌های پیوست و لوگوهای بارگذاری‌شده
            if (modules.Contains("uploads", StringComparer.OrdinalIgnoreCase))
            {
                var uploadsDir = GetUploadsPath();
                int uploadCount = 0;
                long totalUploadBytes = 0;

                if (Directory.Exists(uploadsDir))
                {
                    var files = Directory.GetFiles(uploadsDir, "*", SearchOption.AllDirectories);
                    foreach (var file in files)
                    {
                        var relPath = Path.GetRelativePath(uploadsDir, file).Replace('\\', '/');
                        // جلوگیری از قرار دادن فایل‌های سیستمی موقت
                        if (Path.GetFileName(file).Equals(".gitkeep", StringComparison.OrdinalIgnoreCase))
                            continue;

                        var entryName = "uploads/" + relPath;
                        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                        using (var fs = File.OpenRead(file))
                        using (var es = entry.Open())
                        {
                            await fs.CopyToAsync(es);
                            totalUploadBytes += fs.Length;
                        }
                        uploadCount++;
                    }
                }

                manifest.ItemCounts["UploadFiles"] = uploadCount;
                manifest.ModuleSummaries["uploads"] = $"{uploadCount} فایل پیوست ({FormatBytes(totalUploadBytes)})";
            }

            // ذخیره manifest.json در ریشه فایل فشرده
            await AddJsonEntryAsync(archive, "manifest.json", manifest);
        }

        return memoryStream.ToArray();
    }

    public async Task<BackupFileInfo> CreateAndSaveBackupAsync(List<string> modules, string? customNote = null, string backupType = "Manual", string? customStoragePath = null)
    {
        var targetDir = GetResolvedStoragePath(customStoragePath);
        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        var prefix = backupType.Equals("Scheduled", StringComparison.OrdinalIgnoreCase) ? "BPMS_AutoBackup_" : "BPMS_Backup_";
        var fileName = $"{prefix}{DateTime.Now:yyyyMMdd_HHmmss}.bpmsbackup";
        var fullPath = Path.Combine(targetDir, fileName);

        var bytes = await CreateBackupZipAsync(modules, customNote, backupType);
        await File.WriteAllBytesAsync(fullPath, bytes);

        var fi = new FileInfo(fullPath);
        var manifest = await PreviewBackupAsync(new MemoryStream(bytes));

        return new BackupFileInfo
        {
            FileName = fileName,
            FilePath = fullPath,
            FileSizeBytes = fi.Length,
            FileSizeFormatted = FormatBytes(fi.Length),
            CreatedAtUtc = manifest.CreatedAtUtc,
            CreatedAtPersian = manifest.CreatedAtPersian,
            BackupType = backupType,
            Modules = manifest.Modules,
            CustomNote = customNote,
            Manifest = manifest
        };
    }

    public async Task<List<BackupFileInfo>> GetBackupFilesAsync(string? customStoragePath = null)
    {
        var targetDir = GetResolvedStoragePath(customStoragePath);
        var result = new List<BackupFileInfo>();

        if (!Directory.Exists(targetDir))
            return result;

        var files = Directory.GetFiles(targetDir, "*.bpmsbackup", SearchOption.TopDirectoryOnly);
        foreach (var f in files)
        {
            var fi = new FileInfo(f);
            var isAuto = fi.Name.StartsWith("BPMS_AutoBackup_", StringComparison.OrdinalIgnoreCase);
            var backupType = isAuto ? "Scheduled" : "Manual";

            BackupManifest? manifest = null;
            try
            {
                using var fs = File.OpenRead(f);
                manifest = await PreviewBackupAsync(fs);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not read manifest from {FileName}", fi.Name);
            }

            result.Add(new BackupFileInfo
            {
                FileName = fi.Name,
                FilePath = fi.FullName,
                FileSizeBytes = fi.Length,
                FileSizeFormatted = FormatBytes(fi.Length),
                CreatedAtUtc = manifest?.CreatedAtUtc ?? fi.CreationTimeUtc,
                CreatedAtPersian = manifest?.CreatedAtPersian ?? ToPersianDateTime(fi.CreationTime),
                BackupType = manifest?.BackupType ?? backupType,
                Modules = manifest?.Modules ?? new List<string>(),
                CustomNote = manifest?.CustomNote,
                Manifest = manifest
            });
        }

        return result.OrderByDescending(b => b.CreatedAtUtc).ToList();
    }

    public async Task<BackupManifest> PreviewBackupAsync(Stream zipStream)
    {
        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, true);
        var manifestEntry = archive.GetEntry("manifest.json");
        if (manifestEntry != null)
        {
            using var s = manifestEntry.Open();
            var manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(s, JsonOpts);
            if (manifest != null) return manifest;
        }

        // ساخت مانیفست پایه در صورت عدم وجود
        var fallbackManifest = new BackupManifest
        {
            BackupVersion = "1.0",
            SystemVersion = "1.0.0",
            CreatedAtUtc = DateTime.UtcNow,
            CreatedAtPersian = ToPersianDateTime(DateTime.Now),
            BackupType = "Unknown"
        };

        foreach (var entry in archive.Entries)
        {
            if (entry.FullName.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            {
                var name = Path.GetFileNameWithoutExtension(entry.FullName);
                fallbackManifest.ItemCounts[name] = 1;
            }
        }

        return fallbackManifest;
    }

    public async Task<BackupManifest> PreviewBackupFileAsync(string fileName, string? customStoragePath = null)
    {
        var targetDir = GetResolvedStoragePath(customStoragePath);
        var fullPath = Path.Combine(targetDir, Path.GetFileName(fileName));
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"فایل پشتیبان {fileName} در مخزن سرور یافت نشد.");
        }

        using var fs = File.OpenRead(fullPath);
        return await PreviewBackupAsync(fs);
    }

    public async Task<RestoreResult> RestoreBackupFileAsync(string fileName, List<string>? selectedModules = null, string? customStoragePath = null)
    {
        var targetDir = GetResolvedStoragePath(customStoragePath);
        var fullPath = Path.Combine(targetDir, Path.GetFileName(fileName));
        if (!File.Exists(fullPath))
        {
            throw new FileNotFoundException($"فایل پشتیبان {fileName} در سرور یافت نشد.");
        }

        using var fs = File.OpenRead(fullPath);
        return await RestoreBackupAsync(fs, selectedModules);
    }

    public async Task<RestoreResult> RestoreBackupAsync(Stream zipStream, List<string>? selectedModules = null)
    {
        var result = new RestoreResult { Success = true };

        using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, true);
        var manifest = await PreviewBackupAsync(zipStream);

        // ماژول‌های مشمول بازیابی
        var modulesToRestore = selectedModules != null && selectedModules.Count > 0
            ? selectedModules
            : (manifest.Modules.Count > 0 ? manifest.Modules : new List<string> { "users", "forms", "data", "settings", "uploads" });

        var conn = _context.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open)
        {
            await conn.OpenAsync();
        }

        using var transaction = (SqlTransaction)await conn.BeginTransactionAsync();

        try
        {
            // ۱. غیرفعال‌سازی موقت چک کردن کلیدهای خارجی جهت تضمین عدم خطا در هنگام جابجایی
            await ExecuteNonQueryAsync(conn, transaction, @"
                ALTER TABLE dbo.AppUserRoles NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.UserGroupMembers NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormGroupAccess NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormShares NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.WorkflowHistory NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormSubmissions NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.Forms NOCHECK CONSTRAINT ALL;
                ALTER TABLE dbo.AiConfigurations NOCHECK CONSTRAINT ALL;
            ");

            // ماژول کاربران و گروه‌ها
            if (modulesToRestore.Contains("users", StringComparer.OrdinalIgnoreCase))
            {
                await RestoreUsersModuleAsync(archive, conn, transaction, result);
                result.RestoredModules.Add("users");
            }

            // ماژول تعاریف فرم‌ها
            if (modulesToRestore.Contains("forms", StringComparer.OrdinalIgnoreCase))
            {
                await RestoreFormsModuleAsync(archive, conn, transaction, result);
                result.RestoredModules.Add("forms");
            }

            // ماژول داده‌ها و کارتابل
            if (modulesToRestore.Contains("data", StringComparer.OrdinalIgnoreCase))
            {
                await RestoreDataModuleAsync(archive, conn, transaction, result);
                result.RestoredModules.Add("data");
            }

            // ماژول تنظیمات سامانه
            if (modulesToRestore.Contains("settings", StringComparer.OrdinalIgnoreCase))
            {
                await RestoreSettingsModuleAsync(archive, conn, transaction, result);
                result.RestoredModules.Add("settings");
            }

            // ماژول فایل‌های بارگذاری‌شده (بدون تراکنش دیتابیس)
            if (modulesToRestore.Contains("uploads", StringComparer.OrdinalIgnoreCase))
            {
                var uploadCount = await RestoreUploadsModuleAsync(archive);
                result.RestoredCounts["UploadFiles"] = uploadCount;
                result.RestoredModules.Add("uploads");
            }

            // فعال‌سازی مجدد کلیدهای خارجی
            await ExecuteNonQueryAsync(conn, transaction, @"
                ALTER TABLE dbo.Forms WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormSubmissions WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormShares WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.WorkflowHistory WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.FormGroupAccess WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.AppUserRoles WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.UserGroupMembers WITH CHECK CHECK CONSTRAINT ALL;
                ALTER TABLE dbo.AiConfigurations WITH CHECK CHECK CONSTRAINT ALL;
            ");

            await transaction.CommitAsync();
            result.Message = "عملیات بازیابی با موفقیت کامل انجام شد.";
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Failed to restore backup.");
            result.Success = false;
            result.Message = $"خطا در بازیابی نسخه پشتیبان: {ex.Message}";
            result.Errors.Add(ex.ToString());
        }

        return result;
    }

    private async Task RestoreUsersModuleAsync(ZipArchive archive, DbConnection conn, SqlTransaction tx, RestoreResult result)
    {
        // AppRoles
        var roles = await ReadJsonEntryAsync<List<AppRole>>(archive, "AppRoles.json");
        if (roles != null)
        {
            foreach (var r in roles)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.AppRoles WHERE RoleID = @RoleID)
                    BEGIN
                        UPDATE dbo.AppRoles SET RoleName = @RoleName, Description = @Description WHERE RoleID = @RoleID;
                    END
                    ELSE
                    BEGIN
                        SET IDENTITY_INSERT dbo.AppRoles ON;
                        INSERT INTO dbo.AppRoles (RoleID, RoleName, Description, CreatedAt)
                        VALUES (@RoleID, @RoleName, @Description, @CreatedAt);
                        SET IDENTITY_INSERT dbo.AppRoles OFF;
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@RoleID", r.RoleID),
                    new SqlParameter("@RoleName", r.RoleName),
                    new SqlParameter("@Description", (object?)r.Description ?? DBNull.Value),
                    new SqlParameter("@CreatedAt", r.CreatedAt));
            }
            result.RestoredCounts["AppRoles"] = roles.Count;
        }

        // AppUsers
        var users = await ReadJsonEntryAsync<List<AppUser>>(archive, "AppUsers.json");
        if (users != null)
        {
            foreach (var u in users)
            {
                var sql = @"
                    -- حل تداخل نام کاربری با آی‌دی متفاوت
                    UPDATE dbo.AppUsers SET Username = Username + '_dup_' + CAST(UserID AS NVARCHAR)
                    WHERE Username = @Username AND UserID <> @UserID;

                    IF EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @UserID)
                    BEGIN
                        UPDATE dbo.AppUsers
                        SET Username = @Username,
                            PasswordHash = @PasswordHash,
                            DisplayName = @DisplayName,
                            Email = @Email,
                            IsActiveDirectoryUser = @IsActiveDirectoryUser,
                            IsActive = @IsActive,
                            CreatedAt = @CreatedAt,
                            LastLoginAt = @LastLoginAt
                        WHERE UserID = @UserID;
                    END
                    ELSE
                    BEGIN
                        SET IDENTITY_INSERT dbo.AppUsers ON;
                        INSERT INTO dbo.AppUsers (UserID, Username, PasswordHash, DisplayName, Email, IsActiveDirectoryUser, IsActive, CreatedAt, LastLoginAt)
                        VALUES (@UserID, @Username, @PasswordHash, @DisplayName, @Email, @IsActiveDirectoryUser, @IsActive, @CreatedAt, @LastLoginAt);
                        SET IDENTITY_INSERT dbo.AppUsers OFF;
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@UserID", u.UserID),
                    new SqlParameter("@Username", u.Username),
                    new SqlParameter("@PasswordHash", (object?)u.PasswordHash ?? DBNull.Value),
                    new SqlParameter("@DisplayName", u.DisplayName),
                    new SqlParameter("@Email", (object?)u.Email ?? DBNull.Value),
                    new SqlParameter("@IsActiveDirectoryUser", u.IsActiveDirectoryUser),
                    new SqlParameter("@IsActive", u.IsActive),
                    new SqlParameter("@CreatedAt", u.CreatedAt),
                    new SqlParameter("@LastLoginAt", (object?)u.LastLoginAt ?? DBNull.Value));
            }
            result.RestoredCounts["AppUsers"] = users.Count;
        }

        // AppUserRoles
        var userRoles = await ReadJsonEntryAsync<List<AppUserRole>>(archive, "AppUserRoles.json");
        if (userRoles != null)
        {
            foreach (var ur in userRoles)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @UserID)
                       AND EXISTS (SELECT 1 FROM dbo.AppRoles WHERE RoleID = @RoleID)
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM dbo.AppUserRoles WHERE UserID = @UserID AND RoleID = @RoleID)
                        BEGIN
                            INSERT INTO dbo.AppUserRoles (UserID, RoleID, AssignedAt) VALUES (@UserID, @RoleID, @AssignedAt);
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@UserID", ur.UserID),
                    new SqlParameter("@RoleID", ur.RoleID),
                    new SqlParameter("@AssignedAt", ur.AssignedAt));
            }
            result.RestoredCounts["AppUserRoles"] = userRoles.Count;
        }

        // UserGroups
        var groups = await ReadJsonEntryAsync<List<UserGroup>>(archive, "UserGroups.json");
        if (groups != null)
        {
            foreach (var g in groups)
            {
                var sql = @"
                    UPDATE dbo.UserGroups SET GroupName = GroupName + '_dup_' + CAST(GroupID AS NVARCHAR)
                    WHERE GroupName = @GroupName AND GroupID <> @GroupID;

                    IF EXISTS (SELECT 1 FROM dbo.UserGroups WHERE GroupID = @GroupID)
                    BEGIN
                        UPDATE dbo.UserGroups SET GroupName = @GroupName, Description = @Description, CreatedAt = @CreatedAt WHERE GroupID = @GroupID;
                    END
                    ELSE
                    BEGIN
                        SET IDENTITY_INSERT dbo.UserGroups ON;
                        INSERT INTO dbo.UserGroups (GroupID, GroupName, Description, CreatedAt)
                        VALUES (@GroupID, @GroupName, @Description, @CreatedAt);
                        SET IDENTITY_INSERT dbo.UserGroups OFF;
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@GroupID", g.GroupID),
                    new SqlParameter("@GroupName", g.GroupName),
                    new SqlParameter("@Description", (object?)g.Description ?? DBNull.Value),
                    new SqlParameter("@CreatedAt", g.CreatedAt));
            }
            result.RestoredCounts["UserGroups"] = groups.Count;
        }

        // UserGroupMembers
        var groupMembers = await ReadJsonEntryAsync<List<UserGroupMember>>(archive, "UserGroupMembers.json");
        if (groupMembers != null)
        {
            foreach (var gm in groupMembers)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.UserGroups WHERE GroupID = @GroupID)
                       AND EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @UserID)
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM dbo.UserGroupMembers WHERE GroupID = @GroupID AND UserID = @UserID)
                        BEGIN
                            INSERT INTO dbo.UserGroupMembers (GroupID, UserID, JoinedAt) VALUES (@GroupID, @UserID, @JoinedAt);
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@GroupID", gm.GroupID),
                    new SqlParameter("@UserID", gm.UserID),
                    new SqlParameter("@JoinedAt", gm.JoinedAt));
            }
            result.RestoredCounts["UserGroupMembers"] = groupMembers.Count;
        }
    }

    private async Task RestoreFormsModuleAsync(ZipArchive archive, DbConnection conn, SqlTransaction tx, RestoreResult result)
    {
        var forms = await ReadJsonEntryAsync<List<FormDefinition>>(archive, "Forms.json");
        if (forms != null)
        {
            foreach (var f in forms)
            {
                var sql = @"
                    -- اطمینان از وجود کاربر سازنده فرم
                    DECLARE @ValidCreatorID INT = @CreatedByUserID;
                    IF NOT EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @ValidCreatorID)
                    BEGIN
                        SET @ValidCreatorID = (SELECT TOP 1 UserID FROM dbo.AppUsers WHERE IsActive = 1 ORDER BY UserID ASC);
                    END

                    IF EXISTS (SELECT 1 FROM dbo.Forms WHERE FormID = @FormID)
                    BEGIN
                        UPDATE dbo.Forms
                        SET FormCode = @FormCode,
                            Title = @Title,
                            Description = @Description,
                            Tags = @Tags,
                            Category = @Category,
                            Version = @Version,
                            Revision = @Revision,
                            Status = @Status,
                            IsPublic = @IsPublic,
                            IsBiIntegrated = @IsBiIntegrated,
                            SchemaJSON = @SchemaJSON,
                            CreatedByUserID = @ValidCreatorID,
                            CreatedAt = @CreatedAt,
                            PublishedAt = @PublishedAt
                        WHERE FormID = @FormID;
                    END
                    ELSE
                    BEGIN
                        SET IDENTITY_INSERT dbo.Forms ON;
                        INSERT INTO dbo.Forms (FormID, FormCode, Title, Description, Tags, Category, Version, Revision, Status, IsPublic, IsBiIntegrated, SchemaJSON, CreatedByUserID, CreatedAt, PublishedAt)
                        VALUES (@FormID, @FormCode, @Title, @Description, @Tags, @Category, @Version, @Revision, @Status, @IsPublic, @IsBiIntegrated, @SchemaJSON, @ValidCreatorID, @CreatedAt, @PublishedAt);
                        SET IDENTITY_INSERT dbo.Forms OFF;
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@FormID", f.FormID),
                    new SqlParameter("@FormCode", f.FormCode),
                    new SqlParameter("@Title", f.Title),
                    new SqlParameter("@Description", (object?)f.Description ?? DBNull.Value),
                    new SqlParameter("@Tags", (object?)f.Tags ?? DBNull.Value),
                    new SqlParameter("@Category", (object?)f.Category ?? "سازمانی"),
                    new SqlParameter("@Version", f.Version),
                    new SqlParameter("@Revision", f.Revision),
                    new SqlParameter("@Status", f.Status),
                    new SqlParameter("@IsPublic", f.IsPublic),
                    new SqlParameter("@IsBiIntegrated", f.IsBiIntegrated),
                    new SqlParameter("@SchemaJSON", f.SchemaJSON),
                    new SqlParameter("@CreatedByUserID", f.CreatedByUserID),
                    new SqlParameter("@CreatedAt", f.CreatedAt),
                    new SqlParameter("@PublishedAt", (object?)f.PublishedAt ?? DBNull.Value));
            }
            result.RestoredCounts["Forms"] = forms.Count;
        }

        var formAccess = await ReadJsonEntryAsync<List<FormGroupAccess>>(archive, "FormGroupAccess.json");
        if (formAccess != null)
        {
            foreach (var fa in formAccess)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.Forms WHERE FormID = @FormID)
                       AND EXISTS (SELECT 1 FROM dbo.UserGroups WHERE GroupID = @GroupID)
                    BEGIN
                        IF NOT EXISTS (SELECT 1 FROM dbo.FormGroupAccess WHERE FormID = @FormID AND GroupID = @GroupID)
                        BEGIN
                            INSERT INTO dbo.FormGroupAccess (FormID, GroupID, GrantedAt) VALUES (@FormID, @GroupID, @GrantedAt);
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@FormID", fa.FormID),
                    new SqlParameter("@GroupID", fa.GroupID),
                    new SqlParameter("@GrantedAt", fa.GrantedAt));
            }
            result.RestoredCounts["FormGroupAccess"] = formAccess.Count;
        }
    }

    private async Task RestoreDataModuleAsync(ZipArchive archive, DbConnection conn, SqlTransaction tx, RestoreResult result)
    {
        var submissions = await ReadJsonEntryAsync<List<FormSubmission>>(archive, "FormSubmissions.json");
        if (submissions != null)
        {
            foreach (var s in submissions)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.Forms WHERE FormID = @FormID)
                    BEGIN
                        DECLARE @HandlerID INT = @CurrentHandlerUserID;
                        IF @HandlerID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @HandlerID)
                            SET @HandlerID = NULL;

                        DECLARE @SubmitterID INT = @SubmittedByUserID;
                        IF @SubmitterID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @SubmitterID)
                            SET @SubmitterID = NULL;

                        IF EXISTS (SELECT 1 FROM dbo.FormSubmissions WHERE SubmissionID = @SubmissionID)
                        BEGIN
                            UPDATE dbo.FormSubmissions
                            SET FormID = @FormID,
                                TrackingCode = @TrackingCode,
                                DataJSON = @DataJSON,
                                WorkflowStatus = @WorkflowStatus,
                                CurrentHandlerUserID = @HandlerID,
                                CurrentStepIndex = @CurrentStepIndex,
                                SubmittedByUserID = @SubmitterID,
                                SubmittedAt = @SubmittedAt,
                                CompletedAt = @CompletedAt,
                                DataHash = @DataHash,
                                IsLocked = @IsLocked
                            WHERE SubmissionID = @SubmissionID;
                        END
                        ELSE
                        BEGIN
                            SET IDENTITY_INSERT dbo.FormSubmissions ON;
                            INSERT INTO dbo.FormSubmissions (SubmissionID, FormID, TrackingCode, DataJSON, WorkflowStatus, CurrentHandlerUserID, CurrentStepIndex, SubmittedByUserID, SubmittedAt, CompletedAt, DataHash, IsLocked)
                            VALUES (@SubmissionID, @FormID, @TrackingCode, @DataJSON, @WorkflowStatus, @HandlerID, @CurrentStepIndex, @SubmitterID, @SubmittedAt, @CompletedAt, @DataHash, @IsLocked);
                            SET IDENTITY_INSERT dbo.FormSubmissions OFF;
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@SubmissionID", s.SubmissionID),
                    new SqlParameter("@FormID", s.FormID),
                    new SqlParameter("@TrackingCode", s.TrackingCode),
                    new SqlParameter("@DataJSON", s.DataJSON),
                    new SqlParameter("@WorkflowStatus", s.WorkflowStatus),
                    new SqlParameter("@CurrentHandlerUserID", (object?)s.CurrentHandlerUserID ?? DBNull.Value),
                    new SqlParameter("@CurrentStepIndex", s.CurrentStepIndex),
                    new SqlParameter("@SubmittedByUserID", (object?)s.SubmittedByUserID ?? DBNull.Value),
                    new SqlParameter("@SubmittedAt", s.SubmittedAt),
                    new SqlParameter("@CompletedAt", (object?)s.CompletedAt ?? DBNull.Value),
                    new SqlParameter("@DataHash", (object?)s.DataHash ?? DBNull.Value),
                    new SqlParameter("@IsLocked", s.IsLocked));
            }
            result.RestoredCounts["FormSubmissions"] = submissions.Count;
        }

        var shares = await ReadJsonEntryAsync<List<FormShare>>(archive, "FormShares.json");
        if (shares != null)
        {
            foreach (var sh in shares)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.FormSubmissions WHERE SubmissionID = @SubmissionID)
                       AND EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @SharedWithUserID)
                       AND EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @SharedByUserID)
                    BEGIN
                        IF EXISTS (SELECT 1 FROM dbo.FormShares WHERE ShareID = @ShareID)
                        BEGIN
                            UPDATE dbo.FormShares
                            SET SubmissionID = @SubmissionID,
                                SharedWithUserID = @SharedWithUserID,
                                SharedByUserID = @SharedByUserID,
                                SharedAt = @SharedAt,
                                IsRead = @IsRead
                            WHERE ShareID = @ShareID;
                        END
                        ELSE
                        BEGIN
                            SET IDENTITY_INSERT dbo.FormShares ON;
                            INSERT INTO dbo.FormShares (ShareID, SubmissionID, SharedWithUserID, SharedByUserID, SharedAt, IsRead)
                            VALUES (@ShareID, @SubmissionID, @SharedWithUserID, @SharedByUserID, @SharedAt, @IsRead);
                            SET IDENTITY_INSERT dbo.FormShares OFF;
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@ShareID", sh.ShareID),
                    new SqlParameter("@SubmissionID", sh.SubmissionID),
                    new SqlParameter("@SharedWithUserID", sh.SharedWithUserID),
                    new SqlParameter("@SharedByUserID", sh.SharedByUserID),
                    new SqlParameter("@SharedAt", sh.SharedAt),
                    new SqlParameter("@IsRead", sh.IsRead));
            }
            result.RestoredCounts["FormShares"] = shares.Count;
        }

        var history = await ReadJsonEntryAsync<List<WorkflowHistory>>(archive, "WorkflowHistory.json");
        if (history != null)
        {
            foreach (var h in history)
            {
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.FormSubmissions WHERE SubmissionID = @SubmissionID)
                       AND EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @ActionByUserID)
                    BEGIN
                        IF EXISTS (SELECT 1 FROM dbo.WorkflowHistory WHERE HistoryID = @HistoryID)
                        BEGIN
                            UPDATE dbo.WorkflowHistory
                            SET SubmissionID = @SubmissionID,
                                ActionTaken = @ActionTaken,
                                ActionByUserID = @ActionByUserID,
                                ActionAt = @ActionAt,
                                Comments = @Comments,
                                PreviousStatus = @PreviousStatus,
                                NewStatus = @NewStatus
                            WHERE HistoryID = @HistoryID;
                        END
                        ELSE
                        BEGIN
                            SET IDENTITY_INSERT dbo.WorkflowHistory ON;
                            INSERT INTO dbo.WorkflowHistory (HistoryID, SubmissionID, ActionTaken, ActionByUserID, ActionAt, Comments, PreviousStatus, NewStatus)
                            VALUES (@HistoryID, @SubmissionID, @ActionTaken, @ActionByUserID, @ActionAt, @Comments, @PreviousStatus, @NewStatus);
                            SET IDENTITY_INSERT dbo.WorkflowHistory OFF;
                        END
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@HistoryID", h.HistoryID),
                    new SqlParameter("@SubmissionID", h.SubmissionID),
                    new SqlParameter("@ActionTaken", h.ActionTaken),
                    new SqlParameter("@ActionByUserID", h.ActionByUserID),
                    new SqlParameter("@ActionAt", h.ActionAt),
                    new SqlParameter("@Comments", (object?)h.Comments ?? DBNull.Value),
                    new SqlParameter("@PreviousStatus", (object?)h.PreviousStatus ?? DBNull.Value),
                    new SqlParameter("@NewStatus", h.NewStatus));
            }
            result.RestoredCounts["WorkflowHistory"] = history.Count;
        }
    }

    private async Task RestoreSettingsModuleAsync(ZipArchive archive, DbConnection conn, SqlTransaction tx, RestoreResult result)
    {
        var settings = await ReadJsonEntryAsync<List<SystemSetting>>(archive, "SystemSettings.json");
        if (settings != null)
        {
            foreach (var s in settings)
            {
                // حفظ تنظیمات زمان‌بندی فعلی در صورت تمایل سیستم
                var sql = @"
                    IF EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = @SettingKey)
                    BEGIN
                        UPDATE dbo.SystemSettings SET SettingValue = @SettingValue, UpdatedAt = @UpdatedAt WHERE SettingKey = @SettingKey;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO dbo.SystemSettings (SettingKey, SettingValue, UpdatedAt) VALUES (@SettingKey, @SettingValue, @UpdatedAt);
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@SettingKey", s.SettingKey),
                    new SqlParameter("@SettingValue", s.SettingValue),
                    new SqlParameter("@UpdatedAt", s.UpdatedAt));
            }
            result.RestoredCounts["SystemSettings"] = settings.Count;
        }

        var aiConfigs = await ReadJsonEntryAsync<List<AiConfiguration>>(archive, "AiConfigurations.json");
        if (aiConfigs != null)
        {
            foreach (var ai in aiConfigs)
            {
                var sql = @"
                    DECLARE @UpdaterID INT = @UpdatedByUserID;
                    IF @UpdaterID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.AppUsers WHERE UserID = @UpdaterID)
                        SET @UpdaterID = NULL;

                    IF EXISTS (SELECT 1 FROM dbo.AiConfigurations WHERE ConfigID = @ConfigID)
                    BEGIN
                        UPDATE dbo.AiConfigurations
                        SET Provider = @Provider,
                            BaseUrl = @BaseUrl,
                            ApiKey = @ApiKey,
                            ModelName = @ModelName,
                            Temperature = @Temperature,
                            MaxTokens = @MaxTokens,
                            IsEnabled = @IsEnabled,
                            SystemPrompt = @SystemPrompt,
                            UpdatedAt = @UpdatedAt,
                            UpdatedByUserID = @UpdaterID
                        WHERE ConfigID = @ConfigID;
                    END
                    ELSE
                    BEGIN
                        SET IDENTITY_INSERT dbo.AiConfigurations ON;
                        INSERT INTO dbo.AiConfigurations (ConfigID, Provider, BaseUrl, ApiKey, ModelName, Temperature, MaxTokens, IsEnabled, SystemPrompt, UpdatedAt, UpdatedByUserID)
                        VALUES (@ConfigID, @Provider, @BaseUrl, @ApiKey, @ModelName, @Temperature, @MaxTokens, @IsEnabled, @SystemPrompt, @UpdatedAt, @UpdaterID);
                        SET IDENTITY_INSERT dbo.AiConfigurations OFF;
                    END";
                await ExecuteNonQueryAsync(conn, tx, sql,
                    new SqlParameter("@ConfigID", ai.ConfigID),
                    new SqlParameter("@Provider", ai.Provider),
                    new SqlParameter("@BaseUrl", ai.BaseUrl),
                    new SqlParameter("@ApiKey", (object?)ai.ApiKey ?? DBNull.Value),
                    new SqlParameter("@ModelName", ai.ModelName),
                    new SqlParameter("@Temperature", ai.Temperature),
                    new SqlParameter("@MaxTokens", ai.MaxTokens),
                    new SqlParameter("@IsEnabled", ai.IsEnabled),
                    new SqlParameter("@SystemPrompt", (object?)ai.SystemPrompt ?? DBNull.Value),
                    new SqlParameter("@UpdatedAt", ai.UpdatedAt),
                    new SqlParameter("@UpdatedByUserID", (object?)ai.UpdatedByUserID ?? DBNull.Value));
            }
            result.RestoredCounts["AiConfigurations"] = aiConfigs.Count;
        }
    }

    private async Task<int> RestoreUploadsModuleAsync(ZipArchive archive)
    {
        var uploadsDir = GetUploadsPath();
        int extracted = 0;

        foreach (var entry in archive.Entries)
        {
            if (entry.FullName.StartsWith("uploads/", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrEmpty(entry.Name))
            {
                var rel = entry.FullName["uploads/".Length..];
                var targetFile = Path.GetFullPath(Path.Combine(uploadsDir, rel.Replace('/', Path.DirectorySeparatorChar)));

                // محافظت در برابر Zip Slip
                if (!targetFile.StartsWith(uploadsDir, StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("Potential ZipSlip path detected: {FullName}", entry.FullName);
                    continue;
                }

                var parent = Path.GetDirectoryName(targetFile);
                if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
                {
                    Directory.CreateDirectory(parent);
                }

                using var es = entry.Open();
                using var fs = File.Create(targetFile);
                await es.CopyToAsync(fs);
                extracted++;
            }
        }

        return extracted;
    }

    public Task<bool> DeleteBackupFileAsync(string fileName, string? customStoragePath = null)
    {
        var targetDir = GetResolvedStoragePath(customStoragePath);
        var fullPath = Path.Combine(targetDir, Path.GetFileName(fileName));
        if (File.Exists(fullPath))
        {
            File.Delete(fullPath);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public async Task<ScheduleConfigDto> GetScheduleConfigAsync()
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "Backup:ScheduleConfig");
        if (setting != null && !string.IsNullOrWhiteSpace(setting.SettingValue))
        {
            try
            {
                var cfg = JsonSerializer.Deserialize<ScheduleConfigDto>(setting.SettingValue, JsonOpts);
                if (cfg != null) return cfg;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse Backup:ScheduleConfig JSON");
            }
        }

        return new ScheduleConfigDto();
    }

    public async Task SaveScheduleConfigAsync(ScheduleConfigDto config)
    {
        var json = JsonSerializer.Serialize(config, JsonOpts);
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "Backup:ScheduleConfig");
        if (setting == null)
        {
            setting = new SystemSetting
            {
                SettingKey = "Backup:ScheduleConfig",
                SettingValue = json,
                UpdatedAt = DateTime.UtcNow
            };
            _context.SystemSettings.Add(setting);
        }
        else
        {
            setting.SettingValue = json;
            setting.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
    }

    public async Task ApplyRetentionPolicyAsync(string? customStoragePath = null, int maxRetained = 10)
    {
        await Task.Yield();
        if (maxRetained <= 0) maxRetained = 10;

        var targetDir = GetResolvedStoragePath(customStoragePath);
        if (!Directory.Exists(targetDir)) return;

        // فقط فایل‌های زمان‌بندی‌شده یا تمامی فایل‌های خودکار را مشمول پاک‌سازی نگهداری می‌کنیم
        var files = Directory.GetFiles(targetDir, "BPMS_AutoBackup_*.bpmsbackup")
            .Select(f => new FileInfo(f))
            .OrderBy(f => f.CreationTimeUtc)
            .ToList();

        if (files.Count > maxRetained)
        {
            var deleteCount = files.Count - maxRetained;
            for (int i = 0; i < deleteCount; i++)
            {
                try
                {
                    files[i].Delete();
                    _logger.LogInformation("Retention policy: Deleted old backup file {FileName}", files[i].Name);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not delete old backup file {FileName}", files[i].Name);
                }
            }
        }
    }

    public async Task<BackupStatusResponse> GetBackupStatusAsync()
    {
        var schedule = await GetScheduleConfigAsync();
        var storagePath = GetResolvedStoragePath(schedule.StoragePath);

        long freeSpace = 0;
        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(storagePath) ?? "C:\\");
            if (drive.IsReady)
            {
                freeSpace = drive.AvailableFreeSpace;
            }
        }
        catch {}

        var backups = await GetBackupFilesAsync(storagePath);
        long totalSize = backups.Sum(b => b.FileSizeBytes);

        return new BackupStatusResponse
        {
            Schedule = schedule,
            ResolvedStoragePath = storagePath,
            StorageFreeSpaceBytes = freeSpace,
            StorageFreeSpaceFormatted = FormatBytes(freeSpace),
            TotalBackupsCount = backups.Count,
            TotalBackupsSizeBytes = totalSize,
            TotalBackupsSizeFormatted = FormatBytes(totalSize)
        };
    }

    // Helper functions
    private static async Task AddJsonEntryAsync<T>(ZipArchive archive, string entryName, T data)
    {
        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
        using var s = entry.Open();
        await JsonSerializer.SerializeAsync(s, data, JsonOpts);
    }

    private static async Task<T?> ReadJsonEntryAsync<T>(ZipArchive archive, string entryName)
    {
        var entry = archive.GetEntry(entryName);
        if (entry == null) return default;
        using var s = entry.Open();
        return await JsonSerializer.DeserializeAsync<T>(s, JsonOpts);
    }

    private static async Task<int> ExecuteNonQueryAsync(DbConnection conn, SqlTransaction tx, string sql, params SqlParameter[] parameters)
    {
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = sql;
        if (parameters != null && parameters.Length > 0)
        {
            cmd.Parameters.AddRange(parameters);
        }
        return await cmd.ExecuteNonQueryAsync();
    }

    public static string ToPersianDateTime(DateTime dt)
    {
        var pc = new PersianCalendar();
        return $"{pc.GetYear(dt):0000}/{pc.GetMonth(dt):00}/{pc.GetDayOfMonth(dt):00} {dt.Hour:00}:{dt.Minute:00}:{dt.Second:00}";
    }

    public static string FormatBytes(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{bytes / 1024.0:F1} KB";
        if (bytes < 1024 * 1024 * 1024) return $"{bytes / (1024.0 * 1024):F2} MB";
        return $"{bytes / (1024.0 * 1024 * 1024):F2} GB";
    }
}
