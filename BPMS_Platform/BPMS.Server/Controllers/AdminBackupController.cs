using System.Text.Json;
using BPMS.Server.DTOs;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/admin/backup")]
[Authorize(Roles = "Admin")]
public class AdminBackupController : ControllerBase
{
    private readonly IBackupService _backupService;
    private readonly ILogger<AdminBackupController> _logger;

    public AdminBackupController(IBackupService backupService, ILogger<AdminBackupController> logger)
    {
        _backupService = backupService;
        _logger = logger;
    }

    /// <summary>
    /// دریافت وضعیت کلی پشتیبان‌گیری، تنظیمات زمان‌بندی و فضای دیسک
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var status = await _backupService.GetBackupStatusAsync();
        return Ok(status);
    }

    /// <summary>
    /// ذخیره تنظیمات زمان‌بندی پشتیبان‌گیری خودکار
    /// </summary>
    [HttpPost("config")]
    public async Task<IActionResult> SaveConfig([FromBody] ScheduleConfigDto config)
    {
        if (config.IsEnabled)
        {
            BackupSchedulerService.CalculateNextRun(config, DateTime.Now);
        }
        else
        {
            config.NextRunAtUtc = null;
            config.NextRunAtPersian = null;
        }

        await _backupService.SaveScheduleConfigAsync(config);
        return Ok(new { message = "تنظیمات زمان‌بندی با موفقیت ذخیره شد.", config });
    }

    /// <summary>
    /// ایجاد نسخه پشتیبان دستی (دانلود مستقیم یا ذخیره در سرور)
    /// </summary>
    [HttpPost("create")]
    public async Task<IActionResult> CreateBackup([FromBody] BackupRequestDto dto)
    {
        var modules = dto.Modules != null && dto.Modules.Count > 0
            ? dto.Modules
            : new List<string> { "users", "forms", "data", "settings", "uploads" };

        var note = string.IsNullOrWhiteSpace(dto.CustomNote) ? "پشتیبان‌گیری دستی توسط مدیر سیستم" : dto.CustomNote;

        if (dto.SaveToServer)
        {
            var fileInfo = await _backupService.CreateAndSaveBackupAsync(modules, note, "Manual", dto.CustomStoragePath);
            return Ok(new
            {
                message = $"نسخه پشتیبان با نام {fileInfo.FileName} در سرور ذخیره شد.",
                backup = fileInfo
            });
        }
        else
        {
            var bytes = await _backupService.CreateBackupZipAsync(modules, note, "Manual");
            var fileName = $"BPMS_Backup_{DateTime.Now:yyyyMMdd_HHmmss}.bpmsbackup";
            return File(bytes, "application/octet-stream", fileName);
        }
    }

    /// <summary>
    /// دریافت لیست تمام فایل‌های پشتیبان ذخیره‌شده در مخزن سرور
    /// </summary>
    [HttpGet("list")]
    public async Task<IActionResult> GetBackupList([FromQuery] string? storagePath = null)
    {
        var files = await _backupService.GetBackupFilesAsync(storagePath);
        return Ok(files);
    }

    /// <summary>
    /// دانلود یک فایل پشتیبان ذخیره‌شده در سرور
    /// </summary>
    [HttpGet("download/{fileName}")]
    public IActionResult DownloadBackup(string fileName, [FromQuery] string? storagePath = null)
    {
        var cleanName = Path.GetFileName(fileName);
        var dir = _backupService.GetResolvedStoragePath(storagePath);
        var fullPath = Path.Combine(dir, cleanName);

        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound(new { message = "فایل پشتیبان مورد نظر یافت نشد." });
        }

        var stream = System.IO.File.OpenRead(fullPath);
        return File(stream, "application/octet-stream", cleanName);
    }

    /// <summary>
    /// حذف یک فایل پشتیبان از سرور
    /// </summary>
    [HttpDelete("{fileName}")]
    public async Task<IActionResult> DeleteBackup(string fileName, [FromQuery] string? storagePath = null)
    {
        var cleanName = Path.GetFileName(fileName);
        var deleted = await _backupService.DeleteBackupFileAsync(cleanName, storagePath);
        if (!deleted)
        {
            return NotFound(new { message = "فایل پشتیبان برای حذف یافت نشد." });
        }

        return Ok(new { message = $"فایل {cleanName} با موفقیت حذف شد." });
    }

    /// <summary>
    /// پیش‌نمایش محتویات فایل پشتیبان (از فایل آپلودشده یا فایل موجود در سرور)
    /// </summary>
    [HttpPost("preview")]
    public async Task<IActionResult> PreviewBackup([FromForm] IFormFile? file, [FromForm] string? fileName, [FromForm] string? storagePath)
    {
        try
        {
            if (file != null && file.Length > 0)
            {
                using var stream = file.OpenReadStream();
                var manifest = await _backupService.PreviewBackupAsync(stream);
                return Ok(manifest);
            }

            if (!string.IsNullOrWhiteSpace(fileName))
            {
                var manifest = await _backupService.PreviewBackupFileAsync(fileName, storagePath);
                return Ok(manifest);
            }

            return BadRequest(new { message = "هیچ فایلی برای پیش‌نمایش ارسال نشده است." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading backup preview.");
            return BadRequest(new { message = $"فایل ارسال شده نامعتبر است یا ساختار پشتیبان معتبر ندارد: {ex.Message}" });
        }
    }

    /// <summary>
    /// بازیابی نسخه پشتیبان (از فایل آپلودشده یا فایل موجود در سرور)
    /// </summary>
    [HttpPost("restore")]
    public async Task<IActionResult> RestoreBackup([FromForm] IFormFile? file, [FromForm] string? fileName, [FromForm] string? modulesJson, [FromForm] string? storagePath)
    {
        List<string>? selectedModules = null;
        if (!string.IsNullOrWhiteSpace(modulesJson))
        {
            try
            {
                selectedModules = JsonSerializer.Deserialize<List<string>>(modulesJson);
            }
            catch {}
        }

        try
        {
            RestoreResult result;

            if (file != null && file.Length > 0)
            {
                using var stream = file.OpenReadStream();
                result = await _backupService.RestoreBackupAsync(stream, selectedModules);
            }
            else if (!string.IsNullOrWhiteSpace(fileName))
            {
                result = await _backupService.RestoreBackupFileAsync(fileName, selectedModules, storagePath);
            }
            else
            {
                return BadRequest(new { message = "هیچ فایلی جهت بازیابی انتخاب نشده است." });
            }

            if (result.Success)
            {
                return Ok(result);
            }
            else
            {
                return StatusCode(500, result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled error during restore.");
            return StatusCode(500, new { message = $"خطای غیرمنتظره در بازیابی: {ex.Message}" });
        }
    }

    /// <summary>
    /// اجرای فوری زمان‌بندی پشتیبان‌گیری
    /// </summary>
    [HttpPost("trigger-schedule")]
    public async Task<IActionResult> TriggerScheduleNow()
    {
        var config = await _backupService.GetScheduleConfigAsync();
        var modules = config.Modules != null && config.Modules.Count > 0
            ? config.Modules
            : new List<string> { "users", "forms", "data", "settings", "uploads" };

        var fileInfo = await _backupService.CreateAndSaveBackupAsync(
            modules,
            "اجرای دستی زمان‌بندی توسط مدیر",
            "Scheduled",
            config.StoragePath);

        await _backupService.ApplyRetentionPolicyAsync(config.StoragePath, config.MaxRetainedBackups);

        config.LastRunAtUtc = DateTime.UtcNow;
        config.LastRunAtPersian = BackupService.ToPersianDateTime(DateTime.Now);
        config.LastRunStatus = "Success";
        config.LastRunMessage = $"نسخه خودکار با نام {fileInfo.FileName} ({fileInfo.FileSizeFormatted}) ذخیره گردید.";

        BackupSchedulerService.CalculateNextRun(config, DateTime.Now);
        await _backupService.SaveScheduleConfigAsync(config);

        return Ok(new
        {
            message = "عملیات پشتیبان‌گیری طبق برنامه زمان‌بندی با موفقیت اجرا شد.",
            file = fileInfo,
            config
        });
    }
}
