using System.Text.Json;
using BPMS.Server.Models.Dtos;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/admin/license")]
[Authorize(Roles = "Admin")]
public class LicenseController : ControllerBase
{
    private readonly ILicenseService _licenseService;
    private readonly ILogger<LicenseController> _logger;

    // متغیرهای کش در حافظه برای سرویس استعلام آپدیت با انقضای ۲۴ ساعته
    private static UpdateCheckResultDto? _cachedUpdateResult;
    private static DateTime _lastCheckUtc = DateTime.MinValue;
    private static readonly SemaphoreSlim _checkLock = new(1, 1);

    private const string CurrentAppVersion = "1.0.0";
    private const string VersionJsonUrl = "https://raw.githubusercontent.com/NazemiSh/BPMS-BRMS-Platform/main/version.json";
    private const string GithubReleasesApiUrl = "https://api.github.com/repos/NazemiSh/BPMS-BRMS-Platform/releases/latest";

    public LicenseController(ILicenseService licenseService, ILogger<LicenseController> logger)
    {
        _licenseService = licenseService;
        _logger = logger;
    }

    /// <summary>
    /// بررسی خودکار و ایمن وجود نسخه جدید در مخزن گیت‌هاب با تایم‌اوت کوتاه ۳ ثانیه‌ای و کش ۲۴ ساعته
    /// در صورت ایزوله بودن شبکه یا عدم دسترسی به اینترنت، وضعیت Offline را برمی‌گرداند.
    /// </summary>
    [HttpGet("check-update")]
    public async Task<IActionResult> CheckForUpdates([FromQuery] bool force = false)
    {
        if (!force && _cachedUpdateResult != null && (DateTime.UtcNow - _lastCheckUtc) < TimeSpan.FromHours(24))
        {
            return Ok(_cachedUpdateResult);
        }

        await _checkLock.WaitAsync();
        try
        {
            if (!force && _cachedUpdateResult != null && (DateTime.UtcNow - _lastCheckUtc) < TimeSpan.FromHours(24))
            {
                return Ok(_cachedUpdateResult);
            }

            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(3);
            client.DefaultRequestHeaders.Add("User-Agent", "BPMS-Platform-Update-Checker/1.0");

            var result = new UpdateCheckResultDto
            {
                CurrentVersion = CurrentAppVersion,
                CheckedAt = DateTime.UtcNow,
                RepositoryUrl = "https://github.com/NazemiSh/BPMS-BRMS-Platform"
            };

            bool fetched = false;

            // ۱. تلاش اول: بررسی مستقیم فایل version.json در ریشه مخزن گیت‌هاب
            try
            {
                using var response = await client.GetAsync(VersionJsonUrl);
                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(json);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("version", out var vProp))
                    {
                        var latestVer = vProp.GetString()?.Trim() ?? string.Empty;
                        result.LatestVersion = latestVer;
                        result.Status = "Online";
                        if (root.TryGetProperty("releaseDate", out var dProp)) result.ReleaseDate = dProp.GetString();
                        if (root.TryGetProperty("title", out var tProp)) result.Title = tProp.GetString();
                        if (root.TryGetProperty("repositoryUrl", out var rProp) && !string.IsNullOrWhiteSpace(rProp.GetString()))
                            result.RepositoryUrl = rProp.GetString()!;

                        if (root.TryGetProperty("changelog", out var cProp) && cProp.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in cProp.EnumerateArray())
                            {
                                var s = item.GetString();
                                if (!string.IsNullOrWhiteSpace(s)) result.Changelog.Add(s);
                            }
                        }

                        result.HasUpdate = IsNewerVersion(latestVer, CurrentAppVersion);
                        result.Message = result.HasUpdate ? "نسخه جدید سامانه در مخزن گیت‌هاب در دسترس است." : "سامانه شما به آخرین نسخه به‌روز است.";
                        fetched = true;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug("version.json fetch skipped: {Message}", ex.Message);
            }

            // ۲. تلاش دوم: در صورت عدم دستیابی به version.json، استعلام از API گیت‌هاب
            if (!fetched)
            {
                try
                {
                    using var response = await client.GetAsync(GithubReleasesApiUrl);
                    if (response.IsSuccessStatusCode)
                    {
                        var json = await response.Content.ReadAsStringAsync();
                        using var doc = JsonDocument.Parse(json);
                        var root = doc.RootElement;
                        if (root.TryGetProperty("tag_name", out var tagProp))
                        {
                            var tag = tagProp.GetString()?.Trim().TrimStart('v', 'V') ?? string.Empty;
                            result.LatestVersion = tag;
                            result.Status = "Online";
                            if (root.TryGetProperty("name", out var nameProp)) result.Title = nameProp.GetString();
                            if (root.TryGetProperty("published_at", out var pubProp)) result.ReleaseDate = pubProp.GetString();
                            if (root.TryGetProperty("html_url", out var urlProp) && !string.IsNullOrWhiteSpace(urlProp.GetString()))
                                result.RepositoryUrl = urlProp.GetString()!;

                            if (root.TryGetProperty("body", out var bodyProp) && !string.IsNullOrWhiteSpace(bodyProp.GetString()))
                            {
                                var lines = bodyProp.GetString()!.Split(new[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                                foreach (var line in lines)
                                {
                                    var clean = line.Trim().TrimStart('-', '*', ' ');
                                    if (!string.IsNullOrWhiteSpace(clean)) result.Changelog.Add(clean);
                                }
                            }

                            result.HasUpdate = IsNewerVersion(tag, CurrentAppVersion);
                            result.Message = result.HasUpdate ? "نسخه جدید سامانه در مخزن گیت‌هاب در دسترس است." : "سامانه شما به آخرین نسخه به‌روز است.";
                            fetched = true;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("GitHub releases API fetch skipped: {Message}", ex.Message);
                }
            }

            // در صورت عدم برقراری اتصال به شبکه / ایزوله بودن سرور
            if (!fetched)
            {
                result.Status = "Offline";
                result.HasUpdate = false;
                result.LatestVersion = null;
                result.Message = "سرور به اینترنت دسترسی ندارد (شبکه ایزوله اینترانتی).";
            }

            _cachedUpdateResult = result;
            _lastCheckUtc = DateTime.UtcNow;

            return Ok(result);
        }
        finally
        {
            _checkLock.Release();
        }
    }

    private static bool IsNewerVersion(string latestStr, string currentStr)
    {
        if (string.IsNullOrWhiteSpace(latestStr)) return false;
        var cleanLatest = latestStr.Trim().TrimStart('v', 'V');
        var cleanCurrent = currentStr.Trim().TrimStart('v', 'V');

        if (Version.TryParse(cleanLatest, out var vLatest) && Version.TryParse(cleanCurrent, out var vCurrent))
        {
            return vLatest > vCurrent;
        }

        return string.Compare(cleanLatest, cleanCurrent, StringComparison.OrdinalIgnoreCase) > 0;
    }

    /// <summary>
    /// دریافت وضعیت کامل لایسنس جاری سامانه، شناسه سخت‌افزاری (Machine ID)، سقف و تعداد کاربران و اطلاعات تماس پشتیبانی
    /// </summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetLicenseStatus()
    {
        try
        {
            var status = await _licenseService.GetLicenseStatusAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while retrieving license status");
            return StatusCode(500, new { message = "خطا در واکشی وضعیت لایسنس: " + ex.Message });
        }
    }

    /// <summary>
    /// فعال‌سازی یا تمدید لایسنس با کلید رمزنگاری‌شده امضاشده توسط RSA-2048
    /// </summary>
    [HttpPost("activate")]
    public async Task<IActionResult> ActivateLicense([FromBody] ActivateLicenseRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.LicenseKey))
        {
            return BadRequest(new { message = "کد کلید لایسنس نمی‌تواند خالی باشد." });
        }

        try
        {
            var (success, message, status) = await _licenseService.ActivateLicenseAsync(dto.LicenseKey.Trim());
            if (!success)
            {
                return BadRequest(new { message });
            }

            return Ok(new
            {
                message,
                status
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error activating license");
            return StatusCode(500, new { message = "خطای غیرمنتظره در فعال‌سازی لایسنس: " + ex.Message });
        }
    }

    /// <summary>
    /// حذف لایسنس فعال و بازگردانی سامانه به وضعیت آزمایشی (Trial)
    /// </summary>
    [HttpDelete]
    public async Task<IActionResult> RemoveLicense()
    {
        try
        {
            await _licenseService.RemoveLicenseAsync();
            var status = await _licenseService.GetLicenseStatusAsync();
            return Ok(new
            {
                message = "لایسنس با موفقیت حذف گردید و سامانه به حالت آزمایشی (Trial) بازگردانده شد.",
                status
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing license");
            return StatusCode(500, new { message = "خطا در حذف لایسنس: " + ex.Message });
        }
    }

    [HttpPost("remove")]
    public Task<IActionResult> RemoveLicensePost() => RemoveLicense();

    /// <summary>
    /// اندپوینت عمومی فعال‌سازی کلید جدید در شرایط انقضا و قفل شدن سامانه (بدون نیاز به لاگین)
    /// </summary>
    [HttpPost("/api/license/activate-expired")]
    [AllowAnonymous]
    public async Task<IActionResult> ActivateExpiredLicense([FromBody] ActivateLicenseRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.LicenseKey))
        {
            return BadRequest(new { message = "کد کلید لایسنس نمی‌تواند خالی باشد." });
        }

        try
        {
            var currentStatus = await _licenseService.GetLicenseStatusAsync();
            if (currentStatus.Status != "Expired")
            {
                return BadRequest(new { message = "این بخش فقط در شرایط انقضای لایسنس قابل استفاده است. در وضعیت عادی لطفاً از پنل مدیریت اقدام نمایید." });
            }

            var (success, message, status) = await _licenseService.ActivateLicenseAsync(dto.LicenseKey.Trim());
            if (!success)
            {
                return BadRequest(new { message });
            }

            return Ok(new
            {
                message,
                status
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error activating expired license");
            return StatusCode(500, new { message = "خطای غیرمنتظره در فعال‌سازی لایسنس: " + ex.Message });
        }
    }

    /// <summary>
    /// دریافت عمومی وضعیت لایسنس و اطلاعات پشتیبانی جهت نمایش در صفحه قفل
    /// </summary>
    [HttpGet("/api/license/public-status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPublicLicenseStatus()
    {
        var status = await _licenseService.GetLicenseStatusAsync();
        return Ok(new
        {
            status = status.Status,
            isTrial = status.IsTrial,
            machineId = status.MachineId,
            organizationName = status.OrganizationName,
            expiresAtPersian = status.ExpiresAtPersian,
            enableAiModule = status.EnableAiModule,
            vendorInfo = status.VendorInfo
        });
    }

    /// <summary>
    /// استعلام وضعیت عمومی و ماژول‌های فعال لایسنس برای کلاینت
    /// </summary>
    [HttpGet("/api/license/status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetGeneralLicenseStatus()
    {
        var status = await _licenseService.GetLicenseStatusAsync();
        return Ok(status);
    }

    /// <summary>
    /// اندپوینت سازگاری بازگشتی جهت دریافت Machine ID سرور
    /// </summary>
    [HttpGet("/api/license/machine-id")]
    [AllowAnonymous]
    public async Task<IActionResult> GetMachineId()
    {
        var machineId = await _licenseService.GetMachineIdAsync();
        return Ok(new
        {
            machineId,
            timestamp = DateTime.UtcNow
        });
    }
}
