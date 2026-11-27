using System.Net;
using System.Net.Mail;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public class EmailService : IEmailService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EmailService> _logger;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public EmailService(
        IServiceScopeFactory scopeFactory,
        ILogger<EmailService> logger,
        IHttpContextAccessor httpContextAccessor)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _httpContextAccessor = httpContextAccessor;
    }

    public bool IsValidRecipientEmail(string? email, string? username = null)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var trimmed = email.Trim();
        if (string.Equals(username, "local_admin", StringComparison.OrdinalIgnoreCase)) return false;
        if (trimmed.Equals("admin@spkh.local", StringComparison.OrdinalIgnoreCase)) return false;
        if (trimmed.EndsWith(".local", StringComparison.OrdinalIgnoreCase)) return false;
        if (trimmed.EndsWith("@local.host", StringComparison.OrdinalIgnoreCase) || trimmed.EndsWith("@localhost", StringComparison.OrdinalIgnoreCase)) return false;
        if (!trimmed.Contains('@') || trimmed.Length < 5) return false;
        return true;
    }

    public async Task<bool> SendEmailAsync(IEnumerable<string> toEmails, string subject, string body, bool isHtml = false)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var settings = await db.SystemSettings
            .Where(s => s.SettingKey.StartsWith("Email:"))
            .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

        return await SendSmtpInternalAsync(settings, toEmails, subject, body, isHtml);
    }

    public async Task NotifyWorkflowTaskAssignedAsync(long submissionId, string stepName, string? portalUrl = null)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var submission = await db.FormSubmissions
                .Include(s => s.Form)
                .Include(s => s.SubmittedByUser)
                .FirstOrDefaultAsync(s => s.SubmissionID == submissionId);

            if (submission == null)
            {
                _logger.LogWarning("Submission {SubmissionId} not found for workflow email notification.", submissionId);
                return;
            }

            var emailSettings = await db.SystemSettings
                .Where(s => s.SettingKey.StartsWith("Email:"))
                .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

            if (!emailSettings.TryGetValue("Email:SmtpHost", out var host) || string.IsNullOrWhiteSpace(host))
            {
                _logger.LogInformation("SMTP host not configured. Skipping email for submission {SubmissionId}", submissionId);
                return;
            }

            if (!emailSettings.TryGetValue("Email:FromEmail", out var fromEmail) || string.IsNullOrWhiteSpace(fromEmail))
            {
                _logger.LogInformation("FromEmail not configured. Skipping email for submission {SubmissionId}", submissionId);
                return;
            }

            bool sendOnInbox = !emailSettings.TryGetValue("Email:SendOnInboxTask", out var sot) || sot.Equals("true", StringComparison.OrdinalIgnoreCase);
            if (!sendOnInbox)
            {
                _logger.LogInformation("Email:SendOnInboxTask is disabled. Skipping email for submission {SubmissionId}", submissionId);
                return;
            }

            var recipientUserIds = new HashSet<int>();

            // ۱. ارجاع مستقیم
            if (submission.WorkflowStatus.StartsWith("ReferredTo_") && int.TryParse(submission.WorkflowStatus.Replace("ReferredTo_", ""), out var refUserId))
            {
                recipientUserIds.Add(refUserId);
            }
            else if (submission.CurrentHandlerUserID.HasValue)
            {
                recipientUserIds.Add(submission.CurrentHandlerUserID.Value);
            }

            // ۲. استخراج مسئولین مرحله جاری از گردش‌کار فرم
            if (!string.IsNullOrWhiteSpace(submission.Form?.SchemaJSON))
            {
                try
                {
                    using var schemaDoc = JsonDocument.Parse(submission.Form.SchemaJSON);
                    if (schemaDoc.RootElement.TryGetProperty("workflowPolicy", out var wp) &&
                        wp.TryGetProperty("steps", out var stepsEl) && stepsEl.ValueKind == JsonValueKind.Array)
                    {
                        JsonElement? targetStep = null;
                        int sIdx = 0;
                        foreach (var st in stepsEl.EnumerateArray())
                        {
                            var curIdx = st.TryGetProperty("stepIndex", out var si) && si.TryGetInt32(out var idx) ? idx : sIdx;
                            var curName = st.TryGetProperty("stepName", out var sn) ? sn.GetString() : $"مرحله {sIdx + 1}";

                            if (submission.WorkflowStatus.StartsWith($"PendingStep_{curIdx}") ||
                                (!string.IsNullOrEmpty(stepName) && string.Equals(curName, stepName, StringComparison.OrdinalIgnoreCase)))
                            {
                                targetStep = st;
                                break;
                            }
                            sIdx++;
                        }

                        if (targetStep.HasValue)
                        {
                            var st = targetStep.Value;
                            if (st.TryGetProperty("approvers", out var appArr) && appArr.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var a in appArr.EnumerateArray())
                                {
                                    var type = a.TryGetProperty("type", out var tp) ? tp.GetString() : "User";
                                    if (a.TryGetProperty("id", out var idEl) && idEl.TryGetInt32(out var aId))
                                    {
                                        if (string.Equals(type, "User", StringComparison.OrdinalIgnoreCase))
                                        {
                                            recipientUserIds.Add(aId);
                                        }
                                        else if (string.Equals(type, "Group", StringComparison.OrdinalIgnoreCase))
                                        {
                                            var memberIds = await db.UserGroupMembers
                                                .Where(m => m.GroupID == aId)
                                                .Select(m => m.UserID)
                                                .ToListAsync();
                                            foreach (var mid in memberIds) recipientUserIds.Add(mid);
                                        }
                                    }
                                }
                            }
                            else if (st.TryGetProperty("approverType", out var at) && st.TryGetProperty("approverId", out var aid) && aid.TryGetInt32(out var singleId))
                            {
                                var type = at.GetString() ?? "User";
                                if (string.Equals(type, "User", StringComparison.OrdinalIgnoreCase))
                                {
                                    recipientUserIds.Add(singleId);
                                }
                                else if (string.Equals(type, "Group", StringComparison.OrdinalIgnoreCase))
                                {
                                    var memberIds = await db.UserGroupMembers
                                        .Where(m => m.GroupID == singleId)
                                        .Select(m => m.UserID)
                                        .ToListAsync();
                                    foreach (var mid in memberIds) recipientUserIds.Add(mid);
                                }
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error parsing workflow policy for submission {SubmissionId}", submissionId);
                }
            }

            // ۳. بررسی و اضافه کردن جانشین‌های فعال (تفویض کارتابل)
            var finalUserIds = new HashSet<int>(recipientUserIds);
            foreach (var uid in recipientUserIds)
            {
                var delegationSetting = await db.SystemSettings
                    .FirstOrDefaultAsync(s => s.SettingKey == $"Delegation:{uid}");
                if (delegationSetting != null && !string.IsNullOrWhiteSpace(delegationSetting.SettingValue))
                {
                    try
                    {
                        var d = JsonSerializer.Deserialize<DelegationDto>(delegationSetting.SettingValue);
                        if (d != null && d.ToUserId > 0)
                        {
                            finalUserIds.Add(d.ToUserId);
                        }
                    }
                    catch {}
                }
            }

            // ۴. واکشی کاربران و ایمیل‌های معتبر (حذف قطعی local_admin و دامنه‌های .local)
            var targetUsers = await db.AppUsers
                .Where(u => finalUserIds.Contains(u.UserID) && u.IsActive && !string.IsNullOrEmpty(u.Email))
                .ToListAsync();

            var recipientEmails = targetUsers
                .Where(u => IsValidRecipientEmail(u.Email, u.Username))
                .Select(u => u.Email!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (recipientEmails.Count == 0)
            {
                _logger.LogInformation("No valid external recipient email found for submission {SubmissionId}.", submissionId);
                return;
            }

            var formTitle = submission.Form?.Title ?? "فرم سازمانی";
            var trackingCode = submission.TrackingCode;
            var senderName = submission.SubmittedByUser?.DisplayName ?? submission.SubmittedByUser?.Username ?? "عمومی / ناشناس";
            portalUrl = string.IsNullOrWhiteSpace(portalUrl) ? GetPortalUrlFromCurrentRequest() : portalUrl;

            var rawSubject = emailSettings.TryGetValue("Email:DefaultSubject", out var ds) && !string.IsNullOrWhiteSpace(ds)
                ? ds
                : "وظیفه جدید در کارتابل BPMS: {FormTitle}";

            var rawBody = emailSettings.TryGetValue("Email:DefaultBody", out var dbBody) && !string.IsNullOrWhiteSpace(dbBody)
                ? dbBody
                : "با سلام،\nدرخواست جدیدی با مشخصات زیر جهت بررسی و اقدام در کارتابل شما ثبت شده است:\n\n• عنوان فرم: {FormTitle}\n• کد رهگیری: {TrackingCode}\n• مرحله فرآیند: {StepName}\n• متقاضی / ثبت‌کننده: {SenderName}\n\nجهت بررسی و تصمیم‌گیری، لطفاً به سامانه مراجعه فرمایید:\n{PortalLink}";

            var subject = rawSubject
                .Replace("{FormTitle}", formTitle)
                .Replace("{TrackingCode}", trackingCode)
                .Replace("{StepName}", stepName)
                .Replace("{SenderName}", senderName)
                .Replace("{Applicant}", senderName)
                .Replace("{PortalLink}", portalUrl);

            var body = rawBody
                .Replace("{FormTitle}", formTitle)
                .Replace("{TrackingCode}", trackingCode)
                .Replace("{StepName}", stepName)
                .Replace("{SenderName}", senderName)
                .Replace("{Applicant}", senderName)
                .Replace("{PortalLink}", portalUrl);

            await SendSmtpInternalAsync(emailSettings, recipientEmails, subject, body, false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in NotifyWorkflowTaskAssignedAsync for submission {SubmissionId}", submissionId);
        }
    }

    public void EnqueueWorkflowTaskAssigned(long submissionId, string stepName, string? portalUrl = null)
    {
        portalUrl ??= GetPortalUrlFromCurrentRequest();
        Task.Run(async () =>
        {
            try
            {
                await NotifyWorkflowTaskAssignedAsync(submissionId, stepName, portalUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background error sending workflow task email notification for submission {SubmissionId}", submissionId);
            }
        });
    }

    public async Task NotifyAdminsOfPendingFormAsync(int formId, int submitterUserId, string? portalUrl = null)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            var form = await db.Forms.FindAsync(formId);
            if (form == null) return;

            var emailSettings = await db.SystemSettings
                .Where(s => s.SettingKey.StartsWith("Email:"))
                .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

            if (!emailSettings.TryGetValue("Email:SmtpHost", out var host) || string.IsNullOrWhiteSpace(host)) return;
            if (!emailSettings.TryGetValue("Email:FromEmail", out var fromEmail) || string.IsNullOrWhiteSpace(fromEmail)) return;

            var adminUsers = await db.AppUsers
                .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
                .Where(u => u.IsActive && !string.IsNullOrEmpty(u.Email) && u.UserRoles.Any(ur => ur.Role.RoleName == "Admin"))
                .ToListAsync();

            var adminEmails = adminUsers
                .Where(u => IsValidRecipientEmail(u.Email, u.Username))
                .Select(u => u.Email!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (adminEmails.Count == 0) return;

            var submitter = await db.AppUsers.FindAsync(submitterUserId);
            var submitterName = submitter?.DisplayName ?? submitter?.Username ?? "طراح فرآیند";

            portalUrl = string.IsNullOrWhiteSpace(portalUrl) ? GetPortalUrlFromCurrentRequest() : portalUrl;

            var subject = $"درخواست تایید و انتشار فرم جدید در BPMS: {form.Title}";
            var body = $"با سلام،\nفرم «{form.Title}» (نگارش {form.Version}.{form.Revision}) توسط {submitterName} طراحی شده و جهت بررسی ساختار و تایید انتشار در کاتالوگ فرم‌های شما قرار گرفته است.\nورود به سامانه:\n{portalUrl}";

            await SendSmtpInternalAsync(emailSettings, adminEmails, subject, body, false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error in NotifyAdminsOfPendingFormAsync for form {FormId}", formId);
        }
    }

    public void EnqueueNotifyAdminsOfPendingForm(int formId, int submitterUserId, string? portalUrl = null)
    {
        portalUrl ??= GetPortalUrlFromCurrentRequest();
        Task.Run(async () =>
        {
            try
            {
                await NotifyAdminsOfPendingFormAsync(formId, submitterUserId, portalUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background error sending admin pending form notification for FormId {FormId}", formId);
            }
        });
    }

    private async Task<bool> SendSmtpInternalAsync(
        Dictionary<string, string> settings,
        IEnumerable<string> recipientEmails,
        string subject,
        string body,
        bool isHtml)
    {
        if (!settings.TryGetValue("Email:SmtpHost", out var host) || string.IsNullOrWhiteSpace(host)) return false;
        if (!settings.TryGetValue("Email:FromEmail", out var fromEmail) || string.IsNullOrWhiteSpace(fromEmail)) return false;

        int port = settings.TryGetValue("Email:SmtpPort", out var pt) && int.TryParse(pt, out var p) ? p : 587;
        string smtpUser = settings.TryGetValue("Email:SmtpUser", out var u) ? u ?? "" : "";
        string smtpPassword = settings.TryGetValue("Email:SmtpPassword", out var pwd) ? pwd ?? "" : "";
        string fromName = settings.TryGetValue("Email:FromName", out var fn) ? fn ?? "سامانه BPMS" : "سامانه BPMS";
        bool enableSsl = settings.TryGetValue("Email:EnableSsl", out var ssl) && ssl != null && ssl.Equals("true", StringComparison.OrdinalIgnoreCase);

        var validRecipients = recipientEmails
            .Where(e => IsValidRecipientEmail(e))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (validRecipients.Count == 0) return false;

        try
        {
            using var client = new SmtpClient(host.Trim(), port)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                Timeout = 10000
            };

            if (!string.IsNullOrWhiteSpace(smtpUser))
            {
                client.UseDefaultCredentials = false;
                client.Credentials = new NetworkCredential(smtpUser.Trim(), smtpPassword);
            }

            using var message = new MailMessage
            {
                From = new MailAddress(fromEmail.Trim(), fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = isHtml
            };

            foreach (var addr in validRecipients)
            {
                message.To.Add(addr);
            }

            var prevCallback = ServicePointManager.ServerCertificateValidationCallback;
            try
            {
                ServicePointManager.ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true;
                await client.SendMailAsync(message);
                _logger.LogInformation("Successfully sent email to {Count} recipient(s) regarding '{Subject}'", validRecipients.Count, subject);
                return true;
            }
            finally
            {
                ServicePointManager.ServerCertificateValidationCallback = prevCallback;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to recipients ({Recipients}) with subject '{Subject}'", string.Join(",", validRecipients), subject);
            return false;
        }
    }

    private string GetPortalUrlFromCurrentRequest()
    {
        try
        {
            var httpContext = _httpContextAccessor?.HttpContext;
            if (httpContext != null)
            {
                var req = httpContext.Request;
                var origin = req.Headers["Origin"].FirstOrDefault();
                var referer = req.Headers["Referer"].FirstOrDefault();

                if (!string.IsNullOrWhiteSpace(origin))
                {
                    return origin.TrimEnd('/');
                }
                if (!string.IsNullOrWhiteSpace(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var refUri))
                {
                    return refUri.GetLeftPart(UriPartial.Authority);
                }
                return $"{req.Scheme}://{req.Host}";
            }
        }
        catch {}
        return "http://localhost:5000";
    }
}
