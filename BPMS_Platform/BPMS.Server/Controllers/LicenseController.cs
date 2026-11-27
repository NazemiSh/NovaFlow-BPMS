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
    private readonly ISystemUpdateService _updateService;
    private readonly ILogger<LicenseController> _logger;

    public LicenseController(
        ILicenseService licenseService,
        ISystemUpdateService updateService,
        ILogger<LicenseController> logger)
    {
        _licenseService = licenseService;
        _updateService = updateService;
        _logger = logger;
    }

    /// <summary>
    /// بررسی خودکار و ایمن وجود نسخه جدید در مخزن گیت‌هاب
    /// در صورت ایزوله بودن شبکه یا عدم دسترسی به اینترنت، وضعیت Offline را برمی‌گرداند.
    /// </summary>
    [HttpGet("check-update")]
    public async Task<IActionResult> CheckForUpdates([FromQuery] bool force = false, CancellationToken ct = default)
    {
        var result = await _updateService.CheckForUpdatesAsync(force, ct);
        return Ok(result);
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
