using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class WorkflowController : ControllerBase
{
    private readonly IWorkflowService _workflowService;
    private readonly ApplicationDbContext _context;
    private readonly ILogger<WorkflowController> _logger;
    private readonly IWebHostEnvironment? _environment;

    public WorkflowController(
        IWorkflowService workflowService, 
        ApplicationDbContext context, 
        ILogger<WorkflowController> logger,
        IWebHostEnvironment? environment = null)
    {
        _workflowService = workflowService;
        _context = context;
        _logger = logger;
        _environment = environment;
    }

    [HttpPost("submit")]
    public async Task<IActionResult> Submit([FromBody] SubmitFormDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var userId = GetCurrentUserId();
            var result = await _workflowService.SubmitFormAsync(dto, userId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting form");
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpPost("submit-public")]
    [AllowAnonymous]
    public async Task<IActionResult> SubmitPublic([FromBody] SubmitFormDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);

        // اعتبارسنجی تله ربات (Honeypot)
        if (!string.IsNullOrWhiteSpace(dto.Honeypot))
        {
            _logger.LogWarning("Spam/bot submission rejected due to Honeypot trigger for FormId {FormId}", dto.FormId);
            return BadRequest(new { Message = "درخواست نامعتبر شناسایی شد (شناسایی ربات هرزنامه‌ساز)." });
        }

        // اعتبارسنجی کد امنیتی ۵ رقمی آفلاین (کپچا)
        if (!FormsController.VerifyCaptcha(dto.CaptchaToken, dto.CaptchaAnswer))
        {
            return BadRequest(new { Message = "کد امنیتی (کپچا) واردشده نامعتبر یا منقضی شده است. لطفاً کد ۵ رقمی تصویر را مجدداً وارد نمایید." });
        }

        var form = await _context.Forms.FindAsync(dto.FormId);
        if (form == null) return NotFound(new { Message = $"Form with ID {dto.FormId} not found." });

        // اگر شناسه نسخه قدیمی ارسال شده بود، به صورت خودکار نسخه فعال جاری را انتخاب کن
        if (form.Status != "Active" && !string.IsNullOrWhiteSpace(form.FormCode))
        {
            var activeVer = await _context.Forms
                .Where(f => f.FormCode == form.FormCode && f.Status == "Active")
                .OrderByDescending(f => f.Version)
                .FirstOrDefaultAsync();
            if (activeVer != null)
            {
                form = activeVer;
                dto.FormId = activeVer.FormID;
            }
        }

        if (!string.IsNullOrWhiteSpace(form.SchemaJSON))
        {
            using var schemaDoc = JsonDocument.Parse(form.SchemaJSON);
            if (schemaDoc.RootElement.TryGetProperty("publicExpiresAt", out var expProp) && expProp.ValueKind == JsonValueKind.String)
            {
                if (DateTimeOffset.TryParse(expProp.GetString(), out var expTime) && DateTimeOffset.UtcNow >= expTime.ToUniversalTime())
                {
                    form.Status = "Archived";
                    await _context.SaveChangesAsync();
                    throw new InvalidOperationException("مهلت زمانی تکمیل این فرم به پایان رسیده است.");
                }
            }
        }

        if (form.Status != "Active")
            return BadRequest(new { Message = "This form is not active or is archived." });

        bool isPublic = form.IsPublic;
        if (!isPublic && !string.IsNullOrEmpty(form.SchemaJSON))
        {
            try
            {
                using var doc = JsonDocument.Parse(form.SchemaJSON);
                if (doc.RootElement.TryGetProperty("isPublic", out var p) && p.GetBoolean())
                    isPublic = true;
            }
            catch {}
        }

        if (!isPublic)
            return BadRequest(new { Message = "این فرم به عنوان فرم نظرسنجی عمومی پیکربندی نشده است." });

        try
        {
            using var doc = JsonDocument.Parse(dto.FormDataJson);
        }
        catch (JsonException ex)
        {
            return BadRequest(new { Message = $"Invalid FormData JSON: {ex.Message}" });
        }

        if (!string.IsNullOrEmpty(form.SchemaJSON))
        {
            try
            {
                using var doc = JsonDocument.Parse(form.SchemaJSON);
                if (doc.RootElement.TryGetProperty("publicExpiresAt", out var expProp) && expProp.ValueKind == JsonValueKind.String)
                {
                    var expStr = expProp.GetString();
                    if (!string.IsNullOrWhiteSpace(expStr) && DateTimeOffset.TryParse(expStr, out var expTime))
                    {
                        if (DateTimeOffset.UtcNow > expTime.ToUniversalTime())
                            return BadRequest(new { Message = "مهلت زمانی تکمیل این نظرسنجی به پایان رسیده است." });
                    }
                }
            }
            catch {}
        }

        var trackingCode = $"TRK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";

        // انتقال فایل‌های موقت به پوشه اختصاصی کد رهگیری و به‌روزرسانی DataJSON
        var uploadsRoot = SubmissionsController.GetUploadsRootStatic(_environment?.WebRootPath);
        var (promotedJson, _) = SubmissionsController.PromoteTempFilesToTrackingFolder(trackingCode, dto.FormDataJson, uploadsRoot);
        dto.FormDataJson = promotedJson;

        var dataHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(dto.FormDataJson)));

        var submission = new FormSubmission
        {
            FormID = form.FormID,
            TrackingCode = trackingCode,
            DataJSON = dto.FormDataJson,
            WorkflowStatus = "Completed",
            CurrentHandlerUserID = null,
            SubmittedByUserID = null,
            SubmittedAt = DateTime.UtcNow,
            CompletedAt = DateTime.UtcNow,
            DataHash = dataHash,
            IsLocked = true
        };

        _context.FormSubmissions.Add(submission);
        await _context.SaveChangesAsync();

        _context.AuditLogs.Add(new AuditLog
        {
            UserID = null,
            Action = "FormSubmittedPublic",
            EntityName = "FormSubmission",
            EntityID = submission.SubmissionID.ToString(),
            IPAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            Timestamp = DateTime.UtcNow,
            Details = $"Public form '{form.Title}' submitted. TrackingCode: {trackingCode}"
        });

        await _context.SaveChangesAsync();

        return Ok(new CartableItemDto
        {
            SubmissionId = submission.SubmissionID,
            FormId = submission.FormID,
            FormTitle = form.Title,
            TrackingCode = submission.TrackingCode,
            FormDataJson = submission.DataJSON,
            WorkflowStatus = submission.WorkflowStatus,
            SubmittedByUserId = null,
            SubmittedByUserName = "عمومی / ناشناس",
            SubmittedAt = submission.SubmittedAt,
            CurrentHandlerUserId = null,
            CurrentHandlerUserName = null,
            CompletedAt = submission.CompletedAt,
            IsLocked = submission.IsLocked
        });
    }

    [HttpGet("inbox")]
    public async Task<IActionResult> GetInbox()
    {
        var userId = GetCurrentUserId();
        var items = await _workflowService.GetInboxAsync(userId);
        return Ok(items);
    }

    [HttpGet("cc")]
    public async Task<IActionResult> GetCcItems()
    {
        var userId = GetCurrentUserId();
        var items = await _workflowService.GetCcItemsAsync(userId);
        return Ok(items);
    }

    [HttpGet("outbox")]
    public async Task<IActionResult> GetOutbox()
    {
        var userId = GetCurrentUserId();
        var result = await _workflowService.GetOutboxAsync(userId);
        return Ok(result);
    }

    [HttpGet("submissions/{id}")]
    public async Task<IActionResult> GetSubmission(long id)
    {
        var userId = GetCurrentUserId();
        var sub = await _workflowService.GetSubmissionDetailsAsync(id, userId);
        if (sub == null) return NotFound(new { Message = $"Submission {id} not found." });
        return Ok(sub);
    }

    [HttpPost("submissions/{id}/transition")]
    public async Task<IActionResult> Transition(long id, [FromBody] TransitionTaskDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        try
        {
            var userId = GetCurrentUserId();
            var success = await _workflowService.ProcessTransitionAsync(id, dto, userId);
            if (!success) return NotFound(new { Message = $"Submission {id} not found." });
            return Ok(new { Message = $"Task transitioned successfully to {dto.Action}." });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Transition error for SubmissionID={SubmissionID}", id);
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpGet("submissions/{id}/history")]
    public async Task<IActionResult> GetHistory(long id)
    {
        var history = await _workflowService.GetSubmissionHistoryAsync(id);
        return Ok(history);
    }

    [HttpPost("delegate")]
    public async Task<IActionResult> SetDelegation([FromBody] DelegationDto dto)
    {
        var userId = GetCurrentUserId();
        await _workflowService.SetDelegationAsync(userId, dto);
        return Ok(new { Message = "تفویض کارتابل با موفقیت فعال شد." });
    }

    [HttpGet("delegate")]
    public async Task<IActionResult> GetDelegation()
    {
        var userId = GetCurrentUserId();
        var d = await _workflowService.GetActiveDelegationAsync(userId);
        return Ok(d);
    }

    [HttpDelete("delegate")]
    public async Task<IActionResult> CancelDelegation()
    {
        var userId = GetCurrentUserId();
        await _workflowService.CancelDelegationAsync(userId);
        return Ok(new { Message = "تفویض کارتابل لغو شد." });
    }

    [HttpGet("admin/all-tasks")]
    public async Task<IActionResult> GetAllPendingTasks()
    {
        try
        {
            var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
            if (!isAdmin) return StatusCode(StatusCodes.Status403Forbidden, new { Message = "دسترسی غیرمجاز" });

            var tasks = await _workflowService.GetAdminMonitoringTasksAsync();
            return Ok(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in GetAllPendingTasks");
            return StatusCode(500, new { Message = "خطا در دریافت لیست کارتابل‌ها: " + ex.Message });
        }
    }

    [HttpPost("admin/reassign")]
    public async Task<IActionResult> AdminReassignTask([FromBody] System.Text.Json.JsonElement payload)
    {
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
        if (!isAdmin) return StatusCode(StatusCodes.Status403Forbidden, new { Message = "دسترسی غیرمجاز" });

        long submissionId = payload.GetProperty("submissionId").GetInt64();
        int newUserId = payload.GetProperty("newUserId").GetInt32();

        int? fromUserId = null;
        if (payload.TryGetProperty("targetFromUserId", out var f1) && f1.ValueKind == System.Text.Json.JsonValueKind.Number)
            fromUserId = f1.GetInt32();
        else if (payload.TryGetProperty("fromUserId", out var f2) && f2.ValueKind == System.Text.Json.JsonValueKind.Number)
            fromUserId = f2.GetInt32();

        string comment = payload.TryGetProperty("comment", out var c) ? c.GetString() ?? "" : "واگذاری توسط مدیر سیستم";

        int adminId = GetCurrentUserId();
        bool success = await _workflowService.ReassignIndividualTaskAsync(submissionId, fromUserId, newUserId, comment, adminId);
        if (!success) return NotFound(new { Message = "درخواست یا کاربر جدید یافت نشد." });

        var newUser = await _context.AppUsers.FindAsync(newUserId);
        string newName = newUser != null ? (!string.IsNullOrWhiteSpace(newUser.DisplayName) ? newUser.DisplayName : newUser.Username) : $"کاربر {newUserId}";
        return Ok(new { Message = $"سهم کارتابل با موفقیت به {newName} واگذار شد." });
    }

    [HttpPost("admin/bulk-reassign")]
    public async Task<IActionResult> AdminBulkReassign([FromBody] System.Text.Json.JsonElement payload)
    {
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
        if (!isAdmin) return StatusCode(StatusCodes.Status403Forbidden, new { Message = "دسترسی غیرمجاز" });

        int fromUserId = payload.GetProperty("fromUserId").GetInt32();
        int toUserId = payload.GetProperty("toUserId").GetInt32();

        int adminId = GetCurrentUserId();
        int count = await _workflowService.BulkReassignUserTasksAsync(fromUserId, toUserId, adminId);

        var toUser = await _context.AppUsers.FindAsync(toUserId);
        string toName = toUser != null ? (!string.IsNullOrWhiteSpace(toUser.DisplayName) ? toUser.DisplayName : toUser.Username) : $"کاربر {toUserId}";
        return Ok(new { Message = $"{count} وظیفه باز با موفقیت به {toName} منتقل شد." });
    }

    private int GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim == null || !int.TryParse(claim.Value, out var userId))
        {
            throw new UnauthorizedAccessException("Current user ID could not be identified.");
        }
        return userId;
    }
}