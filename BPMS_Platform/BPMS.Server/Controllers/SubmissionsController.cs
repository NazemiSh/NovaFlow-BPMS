namespace BPMS.Server.Controllers;

using System.IO.Compression;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using BPMS.Server.Data;
using BPMS.Server.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

[ApiController]
[Route("api/[controller]")]
public class SubmissionsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<SubmissionsController> _logger;

    public SubmissionsController(
        ApplicationDbContext context,
        IWebHostEnvironment environment,
        ILogger<SubmissionsController> logger)
    {
        _context = context;
        _environment = environment;
        _logger = logger;
    }

    public static string GetUploadsRootStatic(string? webRoot)
    {
        if (string.IsNullOrEmpty(webRoot))
        {
            webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        }
        var uploadsPath = Path.Combine(webRoot, "uploads");
        if (!Directory.Exists(uploadsPath))
        {
            Directory.CreateDirectory(uploadsPath);
        }
        return uploadsPath;
    }

    private string GetUploadsRootPath() => GetUploadsRootStatic(_environment.WebRootPath);

    private int? GetCurrentUserIdOrNull()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier);
        if (claim != null && int.TryParse(claim.Value, out var id))
        {
            return id;
        }
        return null;
    }

    private async Task<(FormSubmission? submission, bool hasAccess, string? errorMessage, int statusCode)> CheckSubmissionAccessAsync(string trackingCode)
    {
        if (string.IsNullOrWhiteSpace(trackingCode))
        {
            return (null, false, "کد رهگیری معتبر نیست.", StatusCodes.Status400BadRequest);
        }

        var normalizedCode = trackingCode.Trim();

        // پشتیبانی از فایل‌های پیش‌نویس آپلودشده در temp پیش از ثبت نهایی
        if (normalizedCode.Equals("temp", StringComparison.OrdinalIgnoreCase))
        {
            var dummySub = new FormSubmission
            {
                TrackingCode = "temp",
                WorkflowStatus = "Draft",
                Form = new FormDefinition { IsPublic = true, Title = "پیش‌نویس" }
            };
            return (dummySub, true, null, StatusCodes.Status200OK);
        }

        var submission = await _context.FormSubmissions
            .Include(s => s.Form)
            .Include(s => s.SubmittedByUser)
            .FirstOrDefaultAsync(s => s.TrackingCode == normalizedCode);

        if (submission == null)
        {
            return (null, false, $"پرونده‌ای با کد رهگیری '{normalizedCode}' یافت نشد.", StatusCodes.Status404NotFound);
        }

        // بررسی عمومی بودن فرم
        bool isPublicForm = submission.Form?.IsPublic ?? false;
        if (!isPublicForm && !string.IsNullOrEmpty(submission.Form?.SchemaJSON))
        {
            try
            {
                using var doc = JsonDocument.Parse(submission.Form.SchemaJSON);
                if (doc.RootElement.TryGetProperty("isPublic", out var pubProp) && pubProp.GetBoolean())
                {
                    isPublicForm = true;
                }
            }
            catch { }
        }

        var currentUserId = GetCurrentUserIdOrNull();
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");
        var isSuperUser = User.IsInRole("SuperUser") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "SuperUser");

        bool hasAccess = false;
        if (isAdmin || isSuperUser)
        {
            hasAccess = true;
        }
        else if (currentUserId.HasValue)
        {
            var uid = currentUserId.Value;
            if (submission.SubmittedByUserID == uid ||
                submission.CurrentHandlerUserID == uid ||
                (submission.Form != null && submission.Form.CreatedByUserID == uid))
            {
                hasAccess = true;
            }
            else
            {
                // بررسی مشارکت در گردش‌کار پرونده
                var participated = await _context.WorkflowHistory
                    .AnyAsync(h => h.SubmissionID == submission.SubmissionID && h.ActionByUserID == uid);

                if (participated)
                {
                    hasAccess = true;
                }
                else
                {
                    // بررسی عضویت در گروه‌های مجاز به فرم
                    var userGroupIds = await _context.UserGroupMembers
                        .Where(ugm => ugm.UserID == uid)
                        .Select(ugm => ugm.GroupID)
                        .ToListAsync();

                    if (userGroupIds.Count > 0 && submission.Form != null)
                    {
                        var hasGroupAccess = await _context.FormGroupAccesses
                            .AnyAsync(fga => fga.FormID == submission.Form.FormID && userGroupIds.Contains(fga.GroupID));
                        if (hasGroupAccess)
                        {
                            hasAccess = true;
                        }
                    }
                }
            }
        }

        if (!hasAccess && isPublicForm)
        {
            hasAccess = true;
        }

        if (!hasAccess)
        {
            if (!currentUserId.HasValue)
            {
                return (submission, false, "جهت دسترسی به پیوست‌های این پرونده، لطفاً ابتدا وارد سامانه شوید.", StatusCodes.Status401Unauthorized);
            }
            return (submission, false, "شما مجوز دسترسی به پیوست‌های این پرونده را ندارید.", StatusCodes.Status403Forbidden);
        }

        return (submission, true, null, StatusCodes.Status200OK);
    }

    public class AttachmentItemDto
    {
        public string FileName { get; set; } = string.Empty;
        public string OriginalFileName { get; set; } = string.Empty;
        public string Extension { get; set; } = string.Empty;
        public long Size { get; set; }
        public string SizeFormatted { get; set; } = string.Empty;
        public DateTime UploadedAt { get; set; }
        public string DownloadUrl { get; set; } = string.Empty;
        public bool IsImage { get; set; }
        public string? PhysicalPath { get; set; }
    }

    private static string FormatFileSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1024 * 1024) return $"{(bytes / 1024.0):F1} KB";
        return $"{(bytes / (1024.0 * 1024.0)):F2} MB";
    }

    private static bool IsImageExtension(string ext)
    {
        var cleanExt = ext.TrimStart('.').ToLowerInvariant();
        return cleanExt is "jpg" or "jpeg" or "png" or "webp" or "gif" or "bmp" or "svg";
    }

    private static string? ExtractFileNameFromUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;

        var qIndex = url.IndexOf('?');
        if (qIndex >= 0 && qIndex < url.Length - 1)
        {
            var query = url[(qIndex + 1)..];
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var kv = part.Split('=', 2);
                if (kv.Length == 2 && kv[0].Equals("fileName", StringComparison.OrdinalIgnoreCase))
                {
                    var val = Uri.UnescapeDataString(kv[1].Replace('+', ' '));
                    var safe = Path.GetFileName(val);
                    if (!string.IsNullOrWhiteSpace(safe)) return safe;
                }
            }
        }

        var cleanPath = qIndex >= 0 ? url[..qIndex] : url;
        var fileName = Path.GetFileName(cleanPath);
        return string.IsNullOrWhiteSpace(fileName) ? null : fileName;
    }

    private List<AttachmentItemDto> DiscoverSubmissionAttachments(FormSubmission submission)
    {
        var attachments = new List<AttachmentItemDto>();
        var seenNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var uploadsRoot = GetUploadsRootPath();
        var trackingCode = submission.TrackingCode.Trim();

        // استخراج منحصراً از DataJSON ثبت‌شده همین پرونده (بدون اسکن پوشه مشترک یا temp)
        if (!string.IsNullOrWhiteSpace(submission.DataJSON))
        {
            try
            {
                using var doc = JsonDocument.Parse(submission.DataJSON);
                ExtractFilesFromJsonElement(doc.RootElement, trackingCode, uploadsRoot, attachments, seenNames, submission.SubmittedAt);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse DataJSON while discovering attachments for submission {TrackingCode}", trackingCode);
            }
        }

        return attachments;
    }

    private void ExtractFilesFromJsonElement(
        JsonElement element,
        string trackingCode,
        string uploadsRoot,
        List<AttachmentItemDto> attachments,
        HashSet<string> seenNames,
        DateTime fallbackDate)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            // آیا خود این آبجکت نماینده یک فایل پیوست است؟
            bool isFileObject = (element.TryGetProperty("fileName", out var fnProp) && fnProp.ValueKind == JsonValueKind.String) ||
                                (element.TryGetProperty("originalFileName", out var ofnProp) && ofnProp.ValueKind == JsonValueKind.String) ||
                                (element.TryGetProperty("originalName", out var onProp) && onProp.ValueKind == JsonValueKind.String) ||
                                (element.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String &&
                                 u.GetString()?.Contains("/uploads/", StringComparison.OrdinalIgnoreCase) == true) ||
                                (element.TryGetProperty("downloadUrl", out var du) && du.ValueKind == JsonValueKind.String &&
                                 (du.GetString()?.Contains("/uploads/", StringComparison.OrdinalIgnoreCase) == true ||
                                  du.GetString()?.Contains("/attachments/download", StringComparison.OrdinalIgnoreCase) == true));

            if (isFileObject)
            {
                AddFileFromJsonObject(element, trackingCode, uploadsRoot, attachments, seenNames, fallbackDate);
                return;
            }

            foreach (var prop in element.EnumerateObject())
            {
                ExtractFilesFromJsonElement(prop.Value, trackingCode, uploadsRoot, attachments, seenNames, fallbackDate);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                ExtractFilesFromJsonElement(item, trackingCode, uploadsRoot, attachments, seenNames, fallbackDate);
            }
        }
        else if (element.ValueKind == JsonValueKind.String)
        {
            var str = element.GetString()?.Trim();
            if (!string.IsNullOrEmpty(str))
            {
                if ((str.StartsWith("[") && str.EndsWith("]")) || (str.StartsWith("{") && str.EndsWith("}")))
                {
                    try
                    {
                        using var nestedDoc = JsonDocument.Parse(str);
                        ExtractFilesFromJsonElement(nestedDoc.RootElement, trackingCode, uploadsRoot, attachments, seenNames, fallbackDate);
                        return;
                    }
                    catch { }
                }

                // رشته اگر دارای پسوند فایل باشد و در پوشه ایزوله پرونده وجود داشته باشد یا مسیر پیوست پرونده باشد
                CheckAndAddFileFromString(str, trackingCode, uploadsRoot, attachments, seenNames, fallbackDate);
            }
        }
    }

    private void AddFileFromJsonObject(
        JsonElement obj,
        string trackingCode,
        string uploadsRoot,
        List<AttachmentItemDto> attachments,
        HashSet<string> seenNames,
        DateTime fallbackDate)
    {
        string? fileName = null;
        if (obj.TryGetProperty("fileName", out var fn) && fn.ValueKind == JsonValueKind.String) fileName = fn.GetString();
        else if (obj.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String) fileName = n.GetString();

        string? originalName = null;
        if (obj.TryGetProperty("originalFileName", out var ofn) && ofn.ValueKind == JsonValueKind.String) originalName = ofn.GetString();
        else if (obj.TryGetProperty("originalName", out var on) && on.ValueKind == JsonValueKind.String) originalName = on.GetString();

        string? url = null;
        if (obj.TryGetProperty("downloadUrl", out var du) && du.ValueKind == JsonValueKind.String) url = du.GetString();
        else if (obj.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String) url = u.GetString();

        long size = 0;
        if (obj.TryGetProperty("size", out var s) && s.TryGetInt64(out var sVal)) size = sVal;

        DateTime uploadedAt = fallbackDate;
        if (obj.TryGetProperty("uploadedAt", out var ua) && ua.ValueKind == JsonValueKind.String &&
            DateTime.TryParse(ua.GetString(), out var parsedDate))
        {
            uploadedAt = parsedDate;
        }

        if (string.IsNullOrWhiteSpace(fileName) && !string.IsNullOrWhiteSpace(url))
        {
            fileName = ExtractFileNameFromUrl(url);
        }
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = originalName;
        }

        var safeFileName = !string.IsNullOrWhiteSpace(fileName) ? Path.GetFileName(fileName.Trim()) : null;
        if (string.IsNullOrWhiteSpace(safeFileName) || !seenNames.Add(safeFileName)) return;

        originalName = !string.IsNullOrWhiteSpace(originalName) ? Path.GetFileName(originalName.Trim()) : safeFileName;

        var ext = Path.GetExtension(originalName).TrimStart('.').ToLowerInvariant();
        if (string.IsNullOrEmpty(ext))
        {
            ext = Path.GetExtension(safeFileName).TrimStart('.').ToLowerInvariant();
        }

        var (physicalPath, realSize) = ResolvePhysicalFile(safeFileName, trackingCode, uploadsRoot);
        if (realSize > 0) size = realSize;
        if (!string.IsNullOrEmpty(physicalPath) && System.IO.File.Exists(physicalPath) && uploadedAt == fallbackDate)
        {
            uploadedAt = new FileInfo(physicalPath).CreationTimeUtc;
        }

        var downloadUrl = $"/api/submissions/by-tracking/{Uri.EscapeDataString(trackingCode)}/attachments/download?fileName={Uri.EscapeDataString(safeFileName)}";

        attachments.Add(new AttachmentItemDto
        {
            FileName = safeFileName,
            OriginalFileName = originalName,
            Extension = ext,
            Size = size,
            SizeFormatted = FormatFileSize(size),
            UploadedAt = uploadedAt,
            DownloadUrl = downloadUrl,
            IsImage = IsImageExtension(ext),
            PhysicalPath = physicalPath
        });
    }

    private void CheckAndAddFileFromString(
        string str,
        string trackingCode,
        string uploadsRoot,
        List<AttachmentItemDto> attachments,
        HashSet<string> seenNames,
        DateTime fallbackDate)
    {
        var extracted = ExtractFileNameFromUrl(str);
        if (string.IsNullOrWhiteSpace(extracted)) return;

        var safeFileName = Path.GetFileName(extracted.Trim());
        var ext = Path.GetExtension(safeFileName);
        if (string.IsNullOrEmpty(ext)) return;

        var cleanExt = ext.TrimStart('.').ToLowerInvariant();
        var knownExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "zip", "rar", "7z",
            "png", "jpg", "jpeg", "webp", "gif", "svg", "txt", "csv"
        };

        if (!knownExtensions.Contains(cleanExt)) return;

        var (physicalPath, realSize) = ResolvePhysicalFile(safeFileName, trackingCode, uploadsRoot);
        var isTrackingAttachmentUrl = str.Contains($"/uploads/{trackingCode}/", StringComparison.OrdinalIgnoreCase) ||
                                      str.Contains($"/by-tracking/{trackingCode}/attachments/download", StringComparison.OrdinalIgnoreCase);

        // فقط در صورتی که فایل فیزیکی در پوشه ایزوله همین پرونده یافت شود یا آدرس صریح پیوست همین پرونده باشد ثبت شود
        if (string.IsNullOrEmpty(physicalPath) && !isTrackingAttachmentUrl) return;
        if (!seenNames.Add(safeFileName)) return;

        var uploadedAt = (!string.IsNullOrEmpty(physicalPath) && System.IO.File.Exists(physicalPath))
            ? new FileInfo(physicalPath).CreationTimeUtc
            : fallbackDate;

        var downloadUrl = $"/api/submissions/by-tracking/{Uri.EscapeDataString(trackingCode)}/attachments/download?fileName={Uri.EscapeDataString(safeFileName)}";

        attachments.Add(new AttachmentItemDto
        {
            FileName = safeFileName,
            OriginalFileName = safeFileName,
            Extension = cleanExt,
            Size = realSize,
            SizeFormatted = FormatFileSize(realSize),
            UploadedAt = uploadedAt,
            DownloadUrl = downloadUrl,
            IsImage = IsImageExtension(cleanExt),
            PhysicalPath = physicalPath
        });
    }

    public static (string? physicalPath, long size) ResolvePhysicalFileStatic(string fileName, string trackingCode, string uploadsRoot)
    {
        var safeFileName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeFileName) || string.IsNullOrWhiteSpace(trackingCode))
        {
            return (null, 0);
        }

        var cleanTracking = Path.GetFileName(trackingCode.Trim());
        if (string.IsNullOrWhiteSpace(cleanTracking) || cleanTracking == "." || cleanTracking == "..")
        {
            return (null, 0);
        }

        var fullUploadsRoot = Path.GetFullPath(uploadsRoot);
        if (!fullUploadsRoot.EndsWith(Path.DirectorySeparatorChar))
        {
            fullUploadsRoot += Path.DirectorySeparatorChar;
        }

        // ایزوله‌سازی کامل: جستجو منحصراً در پوشه اختصاصی همان trackingCode انجام می‌شود و هرگز به temp یا مسیر مشترک uploads سرک نمی‌کشد
        var candidateDirs = new List<string>
        {
            Path.Combine(uploadsRoot, cleanTracking),
            Path.Combine(uploadsRoot, "attachments", cleanTracking)
        };

        // ۱. بررسی تطابق دقیق نام فایل در مسیر اختصاصی پرونده
        foreach (var dir in candidateDirs)
        {
            if (!Directory.Exists(dir)) continue;

            var candidatePath = Path.GetFullPath(Path.Combine(dir, safeFileName));
            if (!candidatePath.StartsWith(fullUploadsRoot, StringComparison.OrdinalIgnoreCase)) continue;

            if (System.IO.File.Exists(candidatePath))
            {
                var fi = new FileInfo(candidatePath);
                return (fi.FullName, fi.Length);
            }
        }

        // ۲. جستجوی فایل با پیشوند یکتا صرفاً در پوشه اختصاصی همان پرونده ثبت‌شده (هرگز روی temp اجرا نمی‌شود)
        if (!cleanTracking.Equals("temp", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var dir in candidateDirs)
            {
                if (!Directory.Exists(dir)) continue;

                try
                {
                    var match = Directory.GetFiles(dir, "*_" + safeFileName, SearchOption.TopDirectoryOnly).FirstOrDefault();
                    if (match != null && System.IO.File.Exists(match))
                    {
                        var fullMatch = Path.GetFullPath(match);
                        if (!fullMatch.StartsWith(fullUploadsRoot, StringComparison.OrdinalIgnoreCase)) continue;

                        var fi = new FileInfo(fullMatch);
                        return (fi.FullName, fi.Length);
                    }
                }
                catch { }
            }
        }

        return (null, 0);
    }

    private (string? physicalPath, long size) ResolvePhysicalFile(string fileName, string trackingCode, string uploadsRoot)
        => ResolvePhysicalFileStatic(fileName, trackingCode, uploadsRoot);

    /// <summary>
    /// انتقال فیزیکی فایل‌های موقت به پوشه اختصاصی کد رهگیری و به‌روزرسانی مسیرهای url در DataJSON
    /// </summary>
    public static (string updatedDataJson, int movedCount) PromoteTempFilesToTrackingFolder(string trackingCode, string? dataJson, string uploadsRoot)
    {
        if (string.IsNullOrWhiteSpace(dataJson))
        {
            return (dataJson ?? string.Empty, 0);
        }

        var cleanTracking = Path.GetFileName(trackingCode.Trim());
        if (string.IsNullOrWhiteSpace(cleanTracking) || cleanTracking == "." || cleanTracking == "..")
        {
            return (dataJson, 0);
        }

        var destDir = Path.Combine(uploadsRoot, cleanTracking);
        var tempDirs = new[]
        {
            Path.Combine(uploadsRoot, "temp"),
            Path.Combine(uploadsRoot, "attachments", "temp")
        };

        int movedCount = 0;
        var foundFileNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // ۱. استخراج نام فایل‌های ثبت‌شده در DataJSON
        try
        {
            using var doc = JsonDocument.Parse(dataJson);
            CollectFileNamesFromJson(doc.RootElement, foundFileNames);
        }
        catch
        {
            var matches = System.Text.RegularExpressions.Regex.Matches(
                dataJson,
                @"""(?:fileName|url|downloadUrl)""\s*:\s*""([^""]+)""",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
            foreach (System.Text.RegularExpressions.Match m in matches)
            {
                if (m.Success && m.Groups.Count > 1)
                {
                    var fn = ExtractFileNameFromUrl(m.Groups[1].Value);
                    if (!string.IsNullOrEmpty(fn)) foundFileNames.Add(fn);
                }
            }
        }

        // ۲. انتقال فیزیکی فایل‌ها از temp به پوشه اختصاصی {trackingCode}
        foreach (var fn in foundFileNames)
        {
            var safeFn = Path.GetFileName(fn);
            if (string.IsNullOrWhiteSpace(safeFn)) continue;

            foreach (var tDir in tempDirs)
            {
                if (!Directory.Exists(tDir)) continue;

                var sourceCandidates = new List<string>();
                var exactPath = Path.Combine(tDir, safeFn);
                if (System.IO.File.Exists(exactPath))
                {
                    sourceCandidates.Add(exactPath);
                }
                else if (!System.Text.RegularExpressions.Regex.IsMatch(safeFn, @"^[a-f0-9]{8}_", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                {
                    try
                    {
                        var wildcards = Directory.GetFiles(tDir, "*_" + safeFn, SearchOption.TopDirectoryOnly);
                        sourceCandidates.AddRange(wildcards);
                    }
                    catch { }
                }

                foreach (var srcPath in sourceCandidates)
                {
                    try
                    {
                        if (!Directory.Exists(destDir))
                        {
                            Directory.CreateDirectory(destDir);
                        }
                        var destFileName = Path.GetFileName(srcPath);
                        var destPath = Path.Combine(destDir, destFileName);
                        if (!System.IO.File.Exists(destPath))
                        {
                            System.IO.File.Move(srcPath, destPath, overwrite: true);
                            movedCount++;
                        }
                    }
                    catch { }
                }
            }
        }

        // ۳. به‌روزرسانی مسیرهای url و downloadUrl در DataJSON
        var updatedJson = dataJson
            .Replace("/by-tracking/temp/attachments/download", $"/by-tracking/{cleanTracking}/attachments/download")
            .Replace("/uploads/attachments/temp/", $"/uploads/{cleanTracking}/")
            .Replace("/uploads/temp/", $"/uploads/{cleanTracking}/");

        return (updatedJson, movedCount);
    }

    private static void CollectFileNamesFromJson(JsonElement element, HashSet<string> fileNames)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            bool hasStoredIdentifier = false;

            if (element.TryGetProperty("fileName", out var fn) && fn.ValueKind == JsonValueKind.String)
            {
                var s = fn.GetString();
                if (!string.IsNullOrWhiteSpace(s))
                {
                    fileNames.Add(Path.GetFileName(s));
                    hasStoredIdentifier = true;
                }
            }
            if (element.TryGetProperty("downloadUrl", out var du) && du.ValueKind == JsonValueKind.String)
            {
                var extracted = ExtractFileNameFromUrl(du.GetString());
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    fileNames.Add(extracted);
                    hasStoredIdentifier = true;
                }
            }
            if (element.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String)
            {
                var extracted = ExtractFileNameFromUrl(u.GetString());
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    fileNames.Add(extracted);
                    hasStoredIdentifier = true;
                }
            }
            if (!hasStoredIdentifier && element.TryGetProperty("originalFileName", out var ofn) && ofn.ValueKind == JsonValueKind.String)
            {
                var s = ofn.GetString();
                if (!string.IsNullOrWhiteSpace(s)) fileNames.Add(Path.GetFileName(s));
            }

            foreach (var prop in element.EnumerateObject())
            {
                CollectFileNamesFromJson(prop.Value, fileNames);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                CollectFileNamesFromJson(item, fileNames);
            }
        }
        else if (element.ValueKind == JsonValueKind.String)
        {
            var str = element.GetString()?.Trim();
            if (!string.IsNullOrEmpty(str) &&
                (str.Contains("/uploads/", StringComparison.OrdinalIgnoreCase) ||
                 str.Contains("/attachments/download", StringComparison.OrdinalIgnoreCase)))
            {
                var extracted = ExtractFileNameFromUrl(str);
                if (!string.IsNullOrWhiteSpace(extracted))
                {
                    fileNames.Add(extracted);
                }
            }
        }
    }

    /// <summary>
    /// بازگرداندن لیست متادیتای فایل‌های پیوست پرونده بر اساس کد رهگیری (با بررسی دسترسی کاربر)
    /// </summary>
    [HttpGet("by-tracking/{trackingCode}/attachments")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSubmissionAttachments(string trackingCode)
    {
        var (submission, hasAccess, errorMessage, statusCode) = await CheckSubmissionAccessAsync(trackingCode);
        if (!hasAccess || submission == null)
        {
            return StatusCode(statusCode, new { message = errorMessage });
        }

        var attachments = DiscoverSubmissionAttachments(submission);
        long totalSize = attachments.Sum(a => a.Size);

        return Ok(new
        {
            trackingCode = submission.TrackingCode,
            submissionId = submission.SubmissionID,
            formTitle = submission.Form?.Title ?? "درخواست اداری",
            workflowStatus = submission.WorkflowStatus,
            submittedAt = submission.SubmittedAt,
            submittedBy = submission.SubmittedByUser?.DisplayName ?? submission.SubmittedByUser?.Username ?? "ناشناس",
            totalCount = attachments.Count,
            totalSize = totalSize,
            totalSizeFormatted = FormatFileSize(totalSize),
            zipDownloadUrl = $"/api/submissions/by-tracking/{Uri.EscapeDataString(submission.TrackingCode)}/attachments/zip",
            attachments = attachments.Select(a => new
            {
                fileName = a.FileName,
                originalFileName = a.OriginalFileName,
                extension = a.Extension.ToUpperInvariant(),
                size = a.Size,
                sizeFormatted = a.SizeFormatted,
                uploadedAt = a.UploadedAt,
                downloadUrl = a.DownloadUrl,
                isImage = a.IsImage
            })
        });
    }

    /// <summary>
    /// فشرده‌سازی درلحظه تمام فایل‌های پیوست پرونده به صورت فایل ZIP
    /// </summary>
    [HttpGet("by-tracking/{trackingCode}/attachments/zip")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadAttachmentsZip(string trackingCode)
    {
        var (submission, hasAccess, errorMessage, statusCode) = await CheckSubmissionAccessAsync(trackingCode);
        if (!hasAccess || submission == null)
        {
            return StatusCode(statusCode, new { message = errorMessage });
        }

        var attachments = DiscoverSubmissionAttachments(submission);
        var filesWithPhysicalPath = attachments.Where(a => !string.IsNullOrEmpty(a.PhysicalPath) && System.IO.File.Exists(a.PhysicalPath)).ToList();

        if (filesWithPhysicalPath.Count == 0)
        {
            return BadRequest(new { message = "هیچ فایل فیزیکی قابل دانلودی برای فشرده‌سازی در این پرونده یافت نشد." });
        }

        using var memoryStream = new MemoryStream();
        using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, leaveOpen: true))
        {
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var item in filesWithPhysicalPath)
            {
                var entryName = Path.GetFileName(item.OriginalFileName);
                if (string.IsNullOrWhiteSpace(entryName)) entryName = item.FileName;

                int counter = 1;
                var baseName = Path.GetFileNameWithoutExtension(entryName);
                var ext = Path.GetExtension(entryName);
                while (usedNames.Contains(entryName))
                {
                    entryName = $"{baseName}_{counter++}{ext}";
                }
                usedNames.Add(entryName);

                var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
                using var entryStream = entry.Open();
                using var fileStream = new FileStream(item.PhysicalPath!, FileMode.Open, FileAccess.Read, FileShare.Read);
                await fileStream.CopyToAsync(entryStream);
            }
        }

        memoryStream.Position = 0;
        var zipBytes = memoryStream.ToArray();
        var zipFileName = $"Attachments_{submission.TrackingCode.Trim()}.zip";

        return File(zipBytes, "application/zip", zipFileName);
    }

    /// <summary>
    /// دانلود امن تکی فایل پیوست با اعتبارسنجی سطح دسترسی و ممانعت از Directory Traversal
    /// </summary>
    [HttpGet("by-tracking/{trackingCode}/attachments/download")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadSingleAttachment(string trackingCode, [FromQuery] string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return BadRequest(new { message = "نام فایل ارسالی خالی است." });
        }

        var (submission, hasAccess, errorMessage, statusCode) = await CheckSubmissionAccessAsync(trackingCode);
        if (!hasAccess || submission == null)
        {
            return StatusCode(statusCode, new { message = errorMessage });
        }

        var uploadsRoot = GetUploadsRootPath();
        var safeFileName = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(safeFileName) || safeFileName == "." || safeFileName == "..")
        {
            return BadRequest(new { message = "نام فایل معتبر نیست." });
        }

        var normalizedTracking = submission.TrackingCode.Trim();
        string? physicalPath = null;

        if (normalizedTracking.Equals("temp", StringComparison.OrdinalIgnoreCase))
        {
            (physicalPath, _) = ResolvePhysicalFile(safeFileName, "temp", uploadsRoot);
        }
        else
        {
            // اطمینان از اینکه فایل درخواستی حتماً در DataJSON همین پرونده ثبت شده است
            var attachments = DiscoverSubmissionAttachments(submission);
            var matched = attachments.FirstOrDefault(a => a.FileName.Equals(safeFileName, StringComparison.OrdinalIgnoreCase))
                       ?? attachments.FirstOrDefault(a => a.OriginalFileName.Equals(safeFileName, StringComparison.OrdinalIgnoreCase));

            if (matched != null && !string.IsNullOrEmpty(matched.PhysicalPath))
            {
                physicalPath = matched.PhysicalPath;
            }
        }

        if (string.IsNullOrEmpty(physicalPath) || !System.IO.File.Exists(physicalPath))
        {
            return NotFound(new { message = $"فایل '{safeFileName}' در سامانه یافت نشد." });
        }

        // بررسی اینکه فایل دقیقاً درون محدوده uploads قرار داشته باشد
        var fullUploads = Path.GetFullPath(uploadsRoot);
        if (!fullUploads.EndsWith(Path.DirectorySeparatorChar))
        {
            fullUploads += Path.DirectorySeparatorChar;
        }
        var fullPhysical = Path.GetFullPath(physicalPath);
        if (!fullPhysical.StartsWith(fullUploads, StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "دسترسی به مسیر فایل غیرمجاز است." });
        }

        var contentType = GetContentType(safeFileName);
        return PhysicalFile(fullPhysical, contentType, safeFileName);
    }

    /// <summary>
    /// آپلود امن فایل پیوست فرم و اتصال به کد رهگیری یا پیش‌نویس
    /// </summary>
    [HttpPost("upload-attachment")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UploadAttachment([FromForm] IFormFile? file, [FromForm] string? trackingCode)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "فایلی جهت بارگذاری انتخاب نشده است." });
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var disallowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js", ".msi", ".dll", ".com", ".scr", ".pif", ".jar", ".cpl", ".reg", ".hta"
        };

        if (disallowedExtensions.Contains(ext))
        {
            return BadRequest(new { message = "بارگذاری فایل‌های اجرایی یا اسکریپتی مجاز نیست." });
        }

        var uploadsRoot = GetUploadsRootPath();
        string targetDir;
        var cleanTracking = !string.IsNullOrWhiteSpace(trackingCode)
            ? Path.GetFileName(trackingCode.Trim())
            : null;

        if (!string.IsNullOrEmpty(cleanTracking) &&
            cleanTracking != "." &&
            cleanTracking != ".." &&
            !cleanTracking.Equals("temp", StringComparison.OrdinalIgnoreCase))
        {
            targetDir = Path.Combine(uploadsRoot, cleanTracking);
        }
        else
        {
            cleanTracking = null;
            targetDir = Path.Combine(uploadsRoot, "temp");
        }

        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        var uniquePrefix = Guid.NewGuid().ToString("N")[..8];
        var originalFileName = Path.GetFileName(file.FileName);
        var storedFileName = $"{uniquePrefix}_{originalFileName}";
        var finalPath = Path.Combine(targetDir, storedFileName);

        using (var stream = new FileStream(finalPath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var effectiveTracking = !string.IsNullOrEmpty(cleanTracking) && !cleanTracking.Equals("temp", StringComparison.OrdinalIgnoreCase)
            ? cleanTracking
            : "temp";
        var downloadUrl = $"/api/submissions/by-tracking/{Uri.EscapeDataString(effectiveTracking)}/attachments/download?fileName={Uri.EscapeDataString(storedFileName)}";

        return Ok(new
        {
            fileName = storedFileName,
            originalFileName = originalFileName,
            extension = ext.TrimStart('.').ToUpperInvariant(),
            size = file.Length,
            sizeFormatted = FormatFileSize(file.Length),
            uploadedAt = DateTime.UtcNow,
            downloadUrl = downloadUrl,
            isImage = IsImageExtension(ext)
        });
    }

    private static string GetContentType(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".doc" => "application/msword",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xls" => "application/vnd.ms-excel",
            ".pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".ppt" => "application/vnd.ms-powerpoint",
            ".zip" => "application/zip",
            ".rar" => "application/x-rar-compressed",
            ".7z" => "application/x-7z-compressed",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".svg" => "image/svg+xml",
            ".txt" => "text/plain; charset=utf-8",
            ".csv" => "text/csv; charset=utf-8",
            _ => "application/octet-stream"
        };
    }
}
