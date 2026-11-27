using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/system")]
public class SystemUpdateController : ControllerBase
{
    private readonly ISystemUpdateService _updateService;
    private readonly ILogger<SystemUpdateController> _logger;

    public SystemUpdateController(ISystemUpdateService updateService, ILogger<SystemUpdateController> logger)
    {
        _updateService = updateService;
        _logger = logger;
    }

    [HttpGet("check-update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CheckUpdate([FromQuery] bool force = false, CancellationToken ct = default)
    {
        var result = await _updateService.CheckForUpdatesAsync(force, ct);
        return Ok(result);
    }

    [HttpPost("apply-update")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ApplyUpdate(CancellationToken ct = default)
    {
        try
        {
            var scheme = Request.Scheme;
            var host = Request.Host.HasValue ? Request.Host.Value : "localhost";
            var healthUrl = $"{scheme}://{host}/api/settings/public";

            var status = await _updateService.StartUpdateAsync(healthUrl, ct);
            return Ok(status);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to apply OTA update");
            return StatusCode(500, new { message = "خطا در اجرای به‌روزرسانی آنلاین: " + ex.Message });
        }
    }

    [HttpGet("update-status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetUpdateStatus()
    {
        var status = await _updateService.GetUpdateStatusAsync();
        return Ok(status);
    }
}
