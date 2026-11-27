namespace BPMS.Server.Controllers;

using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FormsController : ControllerBase
{
    private readonly IFormService _formService;
    private readonly IWorkflowService _workflowService;
    private readonly ApplicationDbContext _context;
    private readonly ILogger<FormsController> _logger;
    private readonly IEmailService _emailService;

    public FormsController(
        IFormService formService,
        IWorkflowService workflowService,
        ApplicationDbContext context, 
        ILogger<FormsController> logger,
        IEmailService emailService)
    {
        _formService = formService;
        _workflowService = workflowService;
        _context = context;
        _logger = logger;
        _emailService = emailService;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(IEnumerable<FormResponseDto>))]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var allForms = (await _formService.GetAllFormsAsync(status)).ToList();

        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
        if (isAdmin)
        {
            foreach (var f in allForms)
            {
                f.CanEditDesign = true;
                f.CanViewReports = true;
                f.CanShare = true;
                f.CanDelete = true;
                f.IsSharedWithMe = false;
            }
            return Ok(allForms);
        }

        var userId = GetCurrentUserId();
        var isSuperUser = User.IsInRole("SuperUser") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "SuperUser");

        var userGroupIds = await _context.UserGroupMembers
            .Where(m => m.UserID == userId)
            .Select(m => m.GroupID)
            .Distinct()
            .ToListAsync();

        var allowedFormIds = await _context.FormGroupAccesses
            .Where(a => userGroupIds.Contains(a.GroupID))
            .Select(a => a.FormID)
            .Distinct()
            .ToListAsync();

        var allowedSet = new HashSet<int>(allowedFormIds);

        // فرم‌هایی که به گروه کاربر اختصاص یافته‌اند (چه فعال و چه غیرفعال‌شده)
        var groupAccessibleForms = allForms
            .Where(f => allowedSet.Contains(f.FormID) && (f.Status == "Active" || f.Status == "Archived"))
            .GroupBy(f => f.Title)
            .SelectMany(g =>
            {
                var activeOnes = g.Where(x => x.Status == "Active").ToList();
                if (activeOnes.Count > 0) return activeOnes;

                // اگر کل فرم غیرفعال شده باشد، آخرین نسخه غیرفعال نمایش داده می‌شود
                var latestArchived = g
                    .OrderByDescending(x => x.Version)
                    .ThenByDescending(x => x.Revision)
                    .FirstOrDefault();
                return latestArchived != null ? new List<FormResponseDto> { latestArchived } : new List<FormResponseDto>();
            })
            .ToList();

        // بررسی و غیرفعال‌سازی خودکار فرم‌های زمان‌دار که مهلت آن‌ها به پایان رسیده است
        var nowUtc = DateTimeOffset.UtcNow;
        var expiredFormIds = new List<int>();
        foreach (var f in allForms.Where(x => x.Status == "Active"))
        {
            if (IsPublicSurveyExpired(f.SchemaJson))
            {
                f.Status = "Archived";
                expiredFormIds.Add(f.FormID);
            }
        }
        if (expiredFormIds.Count > 0)
        {
            var dbFormsToArchive = await _context.Forms
                .Where(f => expiredFormIds.Contains(f.FormID))
                .ToListAsync();
            foreach (var dbForm in dbFormsToArchive)
                dbForm.Status = "Archived";
            await _context.SaveChangesAsync();
        }

        if (isSuperUser)
        {
            var userShares = await _context.FormDefinitionShares
                .Where(s => s.SharedWithUserId == userId)
                .ToListAsync();

            var shareByCode = userShares
                .GroupBy(s => s.FormKey)
                .ToDictionary(g => g.Key, g => new
                {
                    CanEdit = g.Any(x => x.CanEditDesign),
                    CanReport = g.Any(x => x.CanViewReports)
                });

            var shareById = userShares
                .Where(s => s.FormId.HasValue)
                .GroupBy(s => s.FormId!.Value)
                .ToDictionary(g => g.Key, g => new
                {
                    CanEdit = g.Any(x => x.CanEditDesign),
                    CanReport = g.Any(x => x.CanViewReports)
                });

            var myForms = allForms.Where(f => f.CreatedByUserID == userId).ToList();
            foreach (var f in myForms)
            {
                f.CanEditDesign = true;
                f.CanViewReports = true;
                f.CanShare = true;
                f.CanDelete = true;
                f.IsSharedWithMe = false;
            }

            var sharedForms = allForms.Where(f =>
                f.CreatedByUserID != userId &&
                (shareByCode.ContainsKey(f.FormCode) || shareById.ContainsKey(f.FormID))
            ).ToList();

            foreach (var f in sharedForms)
            {
                bool canEdit = false;
                bool canReport = false;
                if (shareByCode.TryGetValue(f.FormCode, out var sc))
                {
                    canEdit |= sc.CanEdit;
                    canReport |= sc.CanReport;
                }
                if (shareById.TryGetValue(f.FormID, out var sf))
                {
                    canEdit |= sf.CanEdit;
                    canReport |= sf.CanReport;
                }
                f.CanEditDesign = canEdit;
                f.CanViewReports = canReport;
                f.CanShare = false;
                f.CanDelete = false;
                f.IsSharedWithMe = true;
            }

            var combined = myForms
                .Concat(sharedForms)
                .Concat(groupAccessibleForms)
                .GroupBy(f => f.FormID)
                .Select(g => g.First())
                .ToList();
            return Ok(combined);
        }

        return Ok(groupAccessibleForms);
    }

    [HttpGet("{id}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(FormResponseDto))]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        if (form.Status == "Active" && IsPublicSurveyExpired(form.SchemaJSON))
        {
            form.Status = "Archived";
            await _context.SaveChangesAsync();
        }

        bool isAuthenticated = User.Identity?.IsAuthenticated == true;
        if (!isAuthenticated && form.Status != "Active")
        {
            return BadRequest(new { Message = "مهلت زمانی تکمیل این نظرسنجی به پایان رسیده یا فرم غیرفعال شده است." });
        }

        var dto = await _formService.GetFormByIdAsync(id);
        return Ok(dto);
    }

    [HttpGet("public/{token}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(FormResponseDto))]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetByPublicToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return NotFound(new { Message = "توکن فرم نظرسنجی نامعتبر است." });

        // ۱. واکشی تمام فرم‌های مرتبط با این توکن به ترتیب بیشترین نگارش و شناسه
        var formsWithToken = await _context.Forms
            .Where(f => f.PublicToken == token)
            .OrderByDescending(f => f.Version)
            .ThenByDescending(f => f.FormID)
            .ToListAsync();

        // اولویت اول: نسخه در حال حاضر فعال (Active)
        // اولویت دوم: آخرین نگارش ثبت‌شده
        FormDefinition? form = formsWithToken.FirstOrDefault(f => f.Status == "Active")
                            ?? formsWithToken.FirstOrDefault();

        // ۲. پشتیبانی برگشتی در صورت ارسال شناسه عددی فرم
        if (form == null && int.TryParse(token, out int formId))
        {
            var targetForm = await _context.Forms.FindAsync(formId);
            if (targetForm != null)
            {
                if (targetForm.Status != "Active" && !string.IsNullOrWhiteSpace(targetForm.FormCode))
                {
                    form = await _context.Forms
                        .Where(f => f.FormCode == targetForm.FormCode && f.Status == "Active")
                        .OrderByDescending(f => f.Version)
                        .FirstOrDefaultAsync() ?? targetForm;
                }
                else
                {
                    form = targetForm;
                }
            }
        }

        if (form == null)
            return NotFound(new { Message = "فرم نظرسنجی مورد نظر یافت نشد." });

        if (form.Status == "Active" && IsPublicSurveyExpired(form.SchemaJSON))
        {
            form.Status = "Archived";
            await _context.SaveChangesAsync();
        }

        bool isAuthenticated = User.Identity?.IsAuthenticated == true;
        if (!isAuthenticated && form.Status != "Active")
        {
            return BadRequest(new { Message = "مهلت زمانی تکمیل این نظرسنجی به پایان رسیده یا فرم غیرفعال شده است." });
        }

        var dto = await _formService.GetFormByIdAsync(form.FormID);
        return Ok(dto);
    }

    [HttpGet("public/captcha")]
    [AllowAnonymous]
    public IActionResult GetPublicCaptcha()
    {
        var rnd = new Random();
        string code = rnd.Next(10000, 100000).ToString();
        long expires = DateTimeOffset.UtcNow.AddMinutes(10).ToUnixTimeSeconds();
        string secret = "BPMS_CAPTCHA_OFFLINE_SECRET_2026";
        string raw = $"{code}:{expires}";
        using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(secret));
        var hash = Convert.ToBase64String(hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw)));
        var token = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes($"{raw}:{hash}"));

        string svg = GenerateDistortedCaptchaSvg(code, rnd);
        string imageUrl = "data:image/svg+xml;base64," + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(svg));

        return Ok(new
        {
            token,
            captchaSvg = svg,
            imageUrl,
            question = "کد امنیتی ۵ رقمی زیر را وارد کنید:",
            prompt = "کد ۵ رقمی امنیتی"
        });
    }

    private static string GenerateDistortedCaptchaSvg(string code, Random rnd)
    {
        int width = 170;
        int height = 52;
        var sb = new System.Text.StringBuilder();

        sb.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\" style=\"border-radius:12px;overflow:hidden;background:#f8fafc;\">");
        sb.Append("<defs>");
        sb.Append("<linearGradient id=\"bg\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">");
        sb.Append("<stop offset=\"0%\" stop-color=\"#eff6ff\" />");
        sb.Append("<stop offset=\"100%\" stop-color=\"#e0e7ff\" />");
        sb.Append("</linearGradient>");
        sb.Append("</defs>");
        sb.Append($"<rect width=\"{width}\" height=\"{height}\" rx=\"10\" fill=\"url(#bg)\" stroke=\"#bfdbfe\" stroke-width=\"1.5\" />");

        // خطوط نویز پس‌زمینه
        string[] lineColors = { "#93c5fd", "#60a5fa", "#3b82f6", "#cbd5e1", "#818cf8" };
        for (int i = 0; i < 5; i++)
        {
            int x1 = rnd.Next(0, 30);
            int y1 = rnd.Next(5, height - 5);
            int x2 = rnd.Next(width - 30, width);
            int y2 = rnd.Next(5, height - 5);
            int cx = rnd.Next(40, width - 40);
            int cy = rnd.Next(5, height - 5);
            string stroke = lineColors[rnd.Next(lineColors.Length)];
            double strokeWidth = 1.0 + rnd.NextDouble() * 1.5;
            sb.Append($"<path d=\"M{x1},{y1} Q{cx},{cy} {x2},{y2}\" stroke=\"{stroke}\" stroke-width=\"{strokeWidth:0.0}\" fill=\"none\" opacity=\"0.6\" />");
        }

        // نقاط نویز تصادفی
        for (int i = 0; i < 28; i++)
        {
            int cx = rnd.Next(5, width - 5);
            int cy = rnd.Next(5, height - 5);
            double r = 1.0 + rnd.NextDouble() * 1.5;
            string dotColor = lineColors[rnd.Next(lineColors.Length)];
            sb.Append($"<circle cx=\"{cx}\" cy=\"{cy}\" r=\"{r:0.0}\" fill=\"{dotColor}\" opacity=\"0.5\" />");
        }

        // کاراکترهای ۵ رقمی با چرخش، اندازه و موقعیت درهم‌ریخته
        string[] charColors = { "#1e3a8a", "#1d4ed8", "#1e40af", "#0f766e", "#312e81", "#0284c7" };
        int startX = 18;
        int stepX = 28;

        for (int i = 0; i < code.Length; i++)
        {
            char ch = code[i];
            int x = startX + (i * stepX) + rnd.Next(-2, 3);
            int y = 35 + rnd.Next(-3, 4);
            int angle = rnd.Next(-22, 23);
            int fontSize = rnd.Next(24, 29);
            string color = charColors[rnd.Next(charColors.Length)];

            sb.Append($"<text x=\"{x}\" y=\"{y}\" fill=\"{color}\" font-size=\"{fontSize}\" font-family=\"Consolas, monospace, sans-serif\" font-weight=\"bold\" transform=\"rotate({angle}, {x}, {y})\">{ch}</text>");
        }

        // خط موج‌دار شکست روی متن
        int fx1 = 5;
        int fy1 = rnd.Next(15, 38);
        int fx2 = width - 5;
        int fy2 = rnd.Next(15, 38);
        int fcx1 = rnd.Next(35, 75);
        int fcy1 = rnd.Next(10, 42);
        int fcx2 = rnd.Next(95, 135);
        int fcy2 = rnd.Next(10, 42);
        sb.Append($"<path d=\"M{fx1},{fy1} C{fcx1},{fcy1} {fcx2},{fcy2} {fx2},{fy2}\" stroke=\"#2563eb\" stroke-width=\"1.8\" fill=\"none\" opacity=\"0.55\" stroke-dasharray=\"6,3\" />");

        sb.Append("</svg>");
        return sb.ToString();
    }

    public static bool VerifyHoneypot(string? honeypot)
    {
        return string.IsNullOrWhiteSpace(honeypot);
    }

    public static bool VerifyCaptcha(string? token, string? answer)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(answer))
            return false;

        try
        {
            var decoded = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(token));
            var parts = decoded.Split(':');
            if (parts.Length != 3) return false;

            string expectedAnswer = parts[0];
            if (!long.TryParse(parts[1], out long expires)) return false;
            string sig = parts[2];

            if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > expires)
                return false;

            string secret = "BPMS_CAPTCHA_OFFLINE_SECRET_2026";
            string raw = $"{expectedAnswer}:{expires}";
            using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(secret));
            var computed = Convert.ToBase64String(hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw)));

            if (sig != computed)
                return false;

            string normalizedInput = answer.Trim()
                .Replace('۰', '0').Replace('۱', '1').Replace('۲', '2').Replace('۳', '3').Replace('۴', '4')
                .Replace('۵', '5').Replace('۶', '6').Replace('۷', '7').Replace('۸', '8').Replace('۹', '9');

            return normalizedInput == expectedAnswer.Trim();
        }
        catch
        {
            return false;
        }
    }

    [HttpGet("{id}/submissions-report")]
    [Authorize(Roles = "Admin,SuperUser")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSubmissionsReport(int id)
    {
        try
        {
            var form = await _context.Forms.FindAsync(id);
            if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

            var userId = GetCurrentUserId();
            var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
            var isSuperUser = User.IsInRole("SuperUser") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "SuperUser");

            bool hasReportShare = await _context.FormDefinitionShares.AnyAsync(s =>
                (s.FormKey == form.FormCode || s.FormId == form.FormID) &&
                s.SharedWithUserId == userId &&
                s.CanViewReports);

            if (!isAdmin && (!isSuperUser || (form.CreatedByUserID != userId && !hasReportShare)))
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { Message = "شما فقط به گزارش فرم‌های ایجادشده یا اشتراک‌گذاری‌شده با خود دسترسی دارید." });
            }

            bool isPublicSurvey = form.IsPublic;
            if (!isPublicSurvey && !string.IsNullOrEmpty(form.SchemaJSON))
            {
                try
                {
                    using var doc = JsonDocument.Parse(form.SchemaJSON);
                    if (doc.RootElement.TryGetProperty("isPublic", out var pubProp) && pubProp.GetBoolean())
                        isPublicSurvey = true;
                }
                catch {}
            }

            var rawSubmissions = await _context.FormSubmissions
                .Include(s => s.SubmittedByUser)
                .Where(s => s.FormID == id)
                .OrderByDescending(s => s.SubmittedAt)
                .ToListAsync();

            var submissions = new List<object>();
            foreach (var s in rawSubmissions)
            {
                var stepsProgress = await _workflowService.GetStepsProgressAsync(s.SubmissionID);
                submissions.Add(new
                {
                    s.SubmissionID,
                    s.TrackingCode,
                    s.WorkflowStatus,
                    s.SubmittedAt,
                    s.CompletedAt,
                    SubmittedByUserName = s.SubmittedByUser != null ? (!string.IsNullOrWhiteSpace(s.SubmittedByUser.DisplayName) ? s.SubmittedByUser.DisplayName : s.SubmittedByUser.Username) : "عمومی / ناشناس",
                    s.DataJSON,
                    StepsProgress = stepsProgress
                });
            }

            return Ok(new
            {
                FormId = form.FormID,
                FormTitle = form.Title,
                form.Version,
                form.Revision,
                form.SchemaJSON,
                IsPublic = isPublicSurvey,
                Submissions = submissions
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting submissions report");
            return StatusCode(500, new { Message = "خطا در سرور: " + ex.Message });
        }
    }

    [HttpPost("{id}/new-version")]
    [ProducesResponseType(StatusCodes.Status200OK, Type = typeof(FormResponseDto))]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> CreateNewVersion(int id, [FromBody] CreateFormDto dto)
    {
        var existingForm = await _context.Forms.FindAsync(id);
        if (existingForm == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        bool hasEditShare = await _context.FormDefinitionShares.AnyAsync(s =>
            (s.FormKey == existingForm.FormCode || s.FormId == existingForm.FormID) &&
            s.SharedWithUserId == userId &&
            s.CanEditDesign);

        if (!isAdmin && existingForm.CreatedByUserID != userId && !hasEditShare)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "شما فقط مجاز به ایجاد نسخه جدید برای فرم‌های خودتان یا فرم‌های اشتراک‌گذاری‌شده با دسترسی ویرایش هستید." });
        }

        var targetTitle = string.IsNullOrWhiteSpace(dto.Title) ? existingForm.Title : dto.Title.Trim();
        var duplicateOtherForm = await _context.Forms.AnyAsync(f => f.FormCode != existingForm.FormCode && f.Title == targetTitle);
        if (duplicateOtherForm)
        {
            return BadRequest(new { message = $"فرمی با عنوان «{targetTitle}» قبلاً در سامانه ایجاد شده است. لطفاً عنوان دیگری انتخاب کنید یا به آن شماره اضافه نمایید." });
        }

        existingForm.Status = "Archived";

        bool isPublic = existingForm.IsPublic;
        if (!string.IsNullOrEmpty(dto.SchemaJson))
        {
            try
            {
                using var doc = JsonDocument.Parse(dto.SchemaJson);
                if (doc.RootElement.TryGetProperty("isPublic", out var pubProp))
                    isPublic = pubProp.GetBoolean();
            }
            catch {}
        }

        var newStatus = (!isAdmin && !isPublic) ? "PendingApproval" : "Active";

        var newForm = new FormDefinition
        {
            FormCode = existingForm.FormCode,
            Title = string.IsNullOrWhiteSpace(dto.Title) ? existingForm.Title : dto.Title,
            Description = dto.Description ?? existingForm.Description,
            Tags = existingForm.Tags,
            SchemaJSON = string.IsNullOrWhiteSpace(dto.SchemaJson) ? existingForm.SchemaJSON : dto.SchemaJson,
            IsPublic = isPublic,
            PublicToken = existingForm.PublicToken ?? FormService.GeneratePublicToken(),
            IsBiIntegrated = existingForm.IsBiIntegrated,
            Status = newStatus,
            Version = existingForm.Version + 1,
            Revision = 0,
            CreatedByUserID = existingForm.CreatedByUserID,
            CreatedAt = DateTime.UtcNow,
            PublishedAt = newStatus == "Active" ? DateTime.UtcNow : null
        };

        _context.Forms.Add(newForm);
        await _context.SaveChangesAsync();

        // کپی دسترسی گروه‌های نسخه قبلی به نسخه جدید
        var prevAccesses = await _context.FormGroupAccesses
            .Where(a => a.FormID == existingForm.FormID)
            .Select(a => a.GroupID)
            .ToListAsync();

        foreach (var gid in prevAccesses)
        {
            _context.FormGroupAccesses.Add(new FormGroupAccess { FormID = newForm.FormID, GroupID = gid });
        }
        await _context.SaveChangesAsync();

        if (newStatus == "PendingApproval")
        {
            await NotifyAdminsOfPendingFormAsync(newForm, userId);
        }

        return Ok(new FormResponseDto
        {
            FormID = newForm.FormID,
            Title = newForm.Title,
            Description = newForm.Description,
            SchemaJson = newForm.SchemaJSON,
            SettingsJson = newForm.Tags,
            Status = newForm.Status,
            Version = newForm.Version,
            Revision = newForm.Revision,
            CreatedByUserID = newForm.CreatedByUserID,
            CreatedAt = newForm.CreatedAt,
            UpdatedAt = newForm.CreatedAt,
            IsPublic = newForm.IsPublic,
            PublicToken = newForm.PublicToken
        });
    }

    [HttpPost]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Create([FromBody] CreateFormDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var userId = GetCurrentUserId();

        var trimmedTitle = dto.Title?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedTitle))
        {
            return BadRequest(new { message = "عنوان فرم نمی‌تواند خالی باشد." });
        }

        // بررسی تکراری نبودن عنوان فرم جدید
        var duplicateExists = await _context.Forms.AnyAsync(f => f.Title == trimmedTitle);
        if (duplicateExists)
        {
            // در صورتی که توسط همین کاربر در ۳۰ ثانیه اخیر ارسال مجدد شده باشد، جهت جلوگیری از دابل کلیک رکورد قبلی بازگردانده می‌شود
            var recentDuplicate = await _context.Forms
                .Where(f => f.CreatedByUserID == userId
                            && f.Title == trimmedTitle
                            && (f.Status == "Draft" || f.Status == "PendingApproval")
                            && f.CreatedAt >= DateTime.UtcNow.AddSeconds(-30))
                .OrderByDescending(f => f.FormID)
                .FirstOrDefaultAsync();

            if (recentDuplicate != null)
            {
                var existingDto = await _formService.GetFormByIdAsync(recentDuplicate.FormID);
                return Ok(existingDto);
            }

            return BadRequest(new { message = $"فرمی با عنوان «{trimmedTitle}» قبلاً در سامانه ایجاد شده است. لطفاً عنوان دیگری انتخاب کنید یا به آن شماره اضافه نمایید." });
        }

        var form = await _formService.CreateFormAsync(dto, userId);
        return Ok(form);
    }

    [HttpPut("{id}")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateFormDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        bool hasEditShare = await _context.FormDefinitionShares.AnyAsync(s =>
            (s.FormKey == form.FormCode || s.FormId == form.FormID) &&
            s.SharedWithUserId == userId &&
            s.CanEditDesign);

        if (!isAdmin && form.CreatedByUserID != userId && !hasEditShare)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "شما مجوز ویرایش این فرم را ندارید." });
        }

        if (!string.IsNullOrWhiteSpace(dto.Title))
        {
            var trimmedTitle = dto.Title.Trim();
            var duplicateOtherForm = await _context.Forms.AnyAsync(f => f.FormCode != form.FormCode && f.Title == trimmedTitle);
            if (duplicateOtherForm)
            {
                return BadRequest(new { message = $"فرمی با عنوان «{trimmedTitle}» قبلاً در سامانه ایجاد شده است. لطفاً عنوان دیگری انتخاب نمایید." });
            }
        }

        var updatedForm = await _formService.UpdateFormAsync(id, dto, userId);
        if (updatedForm == null) return NotFound(new { Message = $"Form with ID {id} not found." });
        return Ok(updatedForm);
    }

    [HttpPost("{id}/publish")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Publish(int id)
    {
        var userId = GetCurrentUserId();
        var success = await _formService.PublishFormAsync(id, userId);
        if (!success) return NotFound(new { Message = $"Form with ID {id} not found or already published." });
        return Ok(success);
    }

    [HttpPost("{id}/request-approval")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> RequestApproval(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });
        form.Status = "PendingApproval";
        await _context.SaveChangesAsync();

        var userId = GetCurrentUserId();
        await NotifyAdminsOfPendingFormAsync(form, userId);

        return Ok(new { Message = "فرم جهت بررسی و فعال‌سازی به مدیر سیستم ارسال شد." });
    }

    [HttpGet("{id}/export")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Export(int id)
    {
        var exportDto = await _formService.ExportFormAsync(id);
        if (exportDto == null) return NotFound(new { Message = $"Form with ID {id} not found." });
        return Ok(exportDto);
    }

    [HttpPost("import")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Import([FromBody] FormExportDto exportDto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var userId = GetCurrentUserId();
        var form = await _formService.ImportFormAsync(exportDto, userId);
        return Ok(form);
    }

    [HttpPost("{id}/toggle-status")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> ToggleStatus(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin)
        {
            bool isPub = form.IsPublic;
            if (!isPub && !string.IsNullOrWhiteSpace(form.SchemaJSON))
            {
                try
                {
                    using var doc = JsonDocument.Parse(form.SchemaJSON);
                    if (doc.RootElement.TryGetProperty("isPublic", out var p) && p.GetBoolean())
                        isPub = true;
                }
                catch {}
            }

            if (form.CreatedByUserID != userId || !isPub)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new { Message = "شما فقط مجاز به فعال یا غیرفعال‌سازی فرم‌های عمومی ایجادشده توسط خودتان هستید." });
            }
        }

        var success = await _formService.ToggleStatusAsync(id, userId);
        if (!success) return NotFound(new { Message = $"Form with ID {id} not found." });
        return Ok(true);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> Delete(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "حذف فرم تنها توسط طراح اصلی یا مدیر سیستم امکان‌پذیر است." });
        }

        var success = await _formService.DeleteFormAsync(id, userId);
        if (!success) return NotFound(new { Message = $"Form with ID {id} not found." });
        return NoContent();
    }

    [HttpGet("{id}/shares")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> GetFormShares(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "مشاهده لیست اشتراک‌گذاری تنها برای طراح فرم و مدیر سیستم مجاز است." });
        }

        var shares = await _context.FormDefinitionShares
            .Include(s => s.SharedWithUser)
            .Where(s => s.FormKey == form.FormCode || s.FormId == form.FormID)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new FormShareDto
            {
                Id = s.Id,
                FormKey = s.FormKey,
                FormId = s.FormId,
                SharedWithUserId = s.SharedWithUserId,
                SharedWithUsername = s.SharedWithUser.Username,
                SharedWithDisplayName = s.SharedWithUser.DisplayName,
                SharedWithEmail = s.SharedWithUser.Email,
                CanEditDesign = s.CanEditDesign,
                CanViewReports = s.CanViewReports,
                SharedByUserId = s.SharedByUserId,
                CreatedAt = s.CreatedAt
            })
            .ToListAsync();

        return Ok(shares);
    }

    [HttpGet("{id}/share-candidates")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> GetFormShareCandidates(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "دسترسی غیرمجاز." });
        }

        var candidates = await _context.AppUsers
            .Where(u => u.IsActive && u.UserID != form.CreatedByUserID)
            .Where(u => u.UserRoles.Any(ur => ur.Role.RoleName == "SuperUser" || ur.Role.RoleName == "Admin"))
            .OrderBy(u => u.DisplayName ?? u.Username)
            .Select(u => new
            {
                userID = u.UserID,
                username = u.Username,
                displayName = u.DisplayName,
                email = u.Email,
                roles = u.UserRoles.Select(ur => ur.Role.RoleName).ToList()
            })
            .ToListAsync();

        return Ok(candidates);
    }

    [HttpPost("{id}/shares")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> UpsertFormShare(int id, [FromBody] UpsertFormShareRequestDto dto)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "تعریف اشتراک فرم تنها توسط طراح اصلی یا مدیر سیستم مجاز است." });
        }

        if (dto.SharedWithUserId == form.CreatedByUserID)
        {
            return BadRequest(new { Message = "امکان اشتراک‌گذاری با طراح اصلی فرم وجود ندارد." });
        }

        var targetUser = await _context.AppUsers
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.UserID == dto.SharedWithUserId);

        if (targetUser == null || !targetUser.IsActive)
        {
            return BadRequest(new { Message = "کاربر مقصد یافت نشد یا حساب وی غیرفعال است." });
        }

        bool isTargetSuperUser = targetUser.UserRoles.Any(r => r.Role.RoleName == "SuperUser" || r.Role.RoleName == "Admin");
        if (!isTargetSuperUser)
        {
            return BadRequest(new { Message = "تنها کاربران ارشد (SuperUser) فعال امکان دریافت اشتراک فرم را دارند." });
        }

        var existingShare = await _context.FormDefinitionShares
            .FirstOrDefaultAsync(s => (s.FormKey == form.FormCode || s.FormId == form.FormID) && s.SharedWithUserId == dto.SharedWithUserId);

        if (existingShare != null)
        {
            existingShare.CanEditDesign = dto.CanEditDesign;
            existingShare.CanViewReports = dto.CanViewReports;
            existingShare.SharedByUserId = userId;
        }
        else
        {
            _context.FormDefinitionShares.Add(new FormDefinitionShare
            {
                FormKey = form.FormCode,
                FormId = form.FormID,
                SharedWithUserId = dto.SharedWithUserId,
                CanEditDesign = dto.CanEditDesign,
                CanViewReports = dto.CanViewReports,
                SharedByUserId = userId,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();
        return Ok(new { Message = $"دسترسی‌های فرم برای کاربر «{targetUser.DisplayName}» با موفقیت ذخیره شد." });
    }

    [HttpDelete("{id}/shares/{targetUserId}")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> DeleteFormShare(int id, int targetUserId)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "حذف اشتراک فرم تنها توسط طراح اصلی یا مدیر سیستم مجاز است." });
        }

        var shares = await _context.FormDefinitionShares
            .Where(s => (s.FormKey == form.FormCode || s.FormId == form.FormID) && s.SharedWithUserId == targetUserId)
            .ToListAsync();

        if (shares.Count > 0)
        {
            _context.FormDefinitionShares.RemoveRange(shares);
            await _context.SaveChangesAsync();
        }

        return Ok(new { Message = "اشتراک فرم با کاربر مورد نظر با موفقیت حذف شد." });
    }

    [HttpPost("{id}/transfer-ownership")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> TransferFormOwnership(int id, [FromBody] TransferFormOwnershipRequestDto dto)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        var targetUser = await _context.AppUsers
            .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.UserID == dto.NewOwnerUserId);

        if (targetUser == null || !targetUser.IsActive)
        {
            return BadRequest(new { Message = "کاربر مقصد یافت نشد یا حساب وی غیرفعال است." });
        }

        bool isTargetSuperUser = targetUser.UserRoles.Any(r => r.Role.RoleName == "SuperUser" || r.Role.RoleName == "Admin");
        if (!isTargetSuperUser)
        {
            return BadRequest(new { Message = "مالکیت فرم تنها به کاربران ارشد (SuperUser) فعال یا مدیر سیستم قابل واگذاری است." });
        }

        // به‌روزرسانی CreatedByUserID در کلیه نگارش‌های فرم با همین FormCode
        var allVersions = await _context.Forms
            .Where(f => f.FormCode == form.FormCode)
            .ToListAsync();

        foreach (var v in allVersions)
        {
            v.CreatedByUserID = dto.NewOwnerUserId;
        }

        // حذف دسترسی اشتراک قبلی اگر برای کاربر جدید وجود داشته باشد
        var sharesOfNewOwner = await _context.FormDefinitionShares
            .Where(s => (s.FormKey == form.FormCode || s.FormId == form.FormID) && s.SharedWithUserId == dto.NewOwnerUserId)
            .ToListAsync();
        if (sharesOfNewOwner.Count > 0)
        {
            _context.FormDefinitionShares.RemoveRange(sharesOfNewOwner);
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Form {FormCode} ownership transferred to UserID {NewOwnerUserId} across {Count} versions.",
            form.FormCode, dto.NewOwnerUserId, allVersions.Count);

        return Ok(new
        {
            Message = $"مالکیت کامل فرم «{form.Title}» در تمامی {allVersions.Count} نگارش آن به «{targetUser.DisplayName}» واگذار شد.",
            UpdatedVersionsCount = allVersions.Count,
            NewOwnerDisplayName = targetUser.DisplayName
        });
    }

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out var userId))
            throw new UnauthorizedAccessException("Unable to determine user ID.");
        return userId;
    }

    [HttpPost("{id}/admin-approve")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminApproveForm(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        form.Status = "Active";
        form.PublishedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(new { Message = $"فرم '{form.Title}' توسط مدیر سیستم تایید و فعال شد." });
    }

    [HttpPost("{id}/admin-reject")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AdminRejectForm(int id, [FromBody] System.Text.Json.JsonElement payload)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = "فرم یافت نشد." });

        string reason = payload.TryGetProperty("reason", out var r) ? r.GetString() ?? "" : "رد شده توسط مدیر سیستم";
        form.Status = "RejectedByAdmin";
        form.Description = $"[دلیل رد ادمین: {reason}] - " + (form.Description ?? "");
        await _context.SaveChangesAsync();

        return Ok(new { Message = $"فرم '{form.Title}' رد شد و جهت بازنگری به طراح فرم بازگردانده شد." });
    }

    private Task NotifyAdminsOfPendingFormAsync(FormDefinition form, int submitterUserId)
    {
        try
        {
            // استخراج آدرس واقعی مرورگر کاربر (پورت 3000 در حالت توسعه یا آدرس دامنه در IIS)
            string portalLink = string.Empty;
            var origin = Request.Headers["Origin"].FirstOrDefault();
            var referer = Request.Headers["Referer"].FirstOrDefault();

            if (!string.IsNullOrWhiteSpace(origin))
            {
                portalLink = origin.TrimEnd('/');
            }
            else if (!string.IsNullOrWhiteSpace(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refUri))
            {
                portalLink = refUri.GetLeftPart(UriPartial.Authority);
            }
            else
            {
                portalLink = $"{Request.Scheme}://{Request.Host}";
            }

            _emailService.EnqueueNotifyAdminsOfPendingForm(form.FormID, submitterUserId, portalLink);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to enqueue admin approval notification email for FormID={FormID}", form.FormID);
        }

        return Task.CompletedTask;
    }

    private static bool IsPublicSurveyExpired(string? schemaJson)
    {
        if (string.IsNullOrWhiteSpace(schemaJson)) return false;
        try
        {
            using var doc = JsonDocument.Parse(schemaJson);
            if (doc.RootElement.TryGetProperty("publicExpiresAt", out var expProp) && expProp.ValueKind == JsonValueKind.String)
            {
                var expStr = expProp.GetString();
                if (!string.IsNullOrWhiteSpace(expStr) && DateTimeOffset.TryParse(expStr, out var expTime))
                {
                    return DateTimeOffset.UtcNow > expTime.ToUniversalTime();
                }
            }
        }
        catch {}
        return false;
    }

    [HttpGet("{id}/print-templates")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetPrintTemplates(int id)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        if (string.IsNullOrWhiteSpace(form.SchemaJSON))
        {
            return Ok(new List<object>());
        }

        try
        {
            using var doc = JsonDocument.Parse(form.SchemaJSON);
            if (doc.RootElement.TryGetProperty("printTemplates", out var templatesProp))
            {
                return Content(templatesProp.GetRawText(), "application/json");
            }
            return Ok(new List<object>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error parsing schema JSON for print templates in form {FormId}", id);
            return Ok(new List<object>());
        }
    }

    [HttpPut("{id}/print-templates")]
    [Authorize(Roles = "Admin,SuperUser")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdatePrintTemplates(int id, [FromBody] JsonElement payload)
    {
        var form = await _context.Forms.FindAsync(id);
        if (form == null) return NotFound(new { Message = $"Form with ID {id} not found." });

        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin && form.CreatedByUserID != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { Message = "شما فقط مجاز به ویرایش قالب‌های چاپ فرم‌های خودتان هستید." });
        }

        try
        {
            JsonObject rootObj;
            if (!string.IsNullOrWhiteSpace(form.SchemaJSON))
            {
                var existingNode = JsonNode.Parse(form.SchemaJSON);
                rootObj = existingNode as JsonObject ?? new JsonObject();
            }
            else
            {
                rootObj = new JsonObject();
            }

            JsonNode? templatesNode = null;
            if (payload.ValueKind == JsonValueKind.Array)
            {
                templatesNode = JsonNode.Parse(payload.GetRawText());
            }
            else if (payload.ValueKind == JsonValueKind.Object)
            {
                if (payload.TryGetProperty("printTemplates", out var ptProp) || payload.TryGetProperty("PrintTemplates", out ptProp))
                {
                    templatesNode = JsonNode.Parse(ptProp.GetRawText());
                }
                else
                {
                    templatesNode = JsonNode.Parse(payload.GetRawText());
                }
            }
            else
            {
                templatesNode = new JsonArray();
            }

            rootObj["printTemplates"] = templatesNode;
            form.SchemaJSON = rootObj.ToJsonString(new JsonSerializerOptions { WriteIndented = false });

            await _context.SaveChangesAsync();
            _logger.LogInformation("Updated print templates for form {FormId} by user {UserId}", id, userId);

            return Ok(new
            {
                Success = true,
                FormID = form.FormID,
                Message = "قالب‌های چاپ فرم با موفقیت ذخیره شدند.",
                PrintTemplates = templatesNode
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating print templates for form {FormId}", id);
            return StatusCode(500, new { Message = "خطا در ذخیره‌سازی قالب‌های چاپ: " + ex.Message });
        }
    }
}