using System.DirectoryServices.Protocols;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Net;
using System.Net.Mail;
using System.Net.Sockets;
using System.Security.Claims;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/settings")]
[Authorize(Roles = "Admin")]
public class SettingsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ISecurityPolicyService _securityPolicyService;
    private readonly string _webRootPath;
    private readonly string _uploadsPath;
    private readonly string _brandingCachePath;

    public SettingsController(
        ApplicationDbContext context,
        IWebHostEnvironment environment,
        ISecurityPolicyService securityPolicyService)
    {
        _context = context;
        _securityPolicyService = securityPolicyService;
        _webRootPath = environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        _uploadsPath = Path.Combine(_webRootPath, "uploads");
        if (!Directory.Exists(_uploadsPath))
        {
            Directory.CreateDirectory(_uploadsPath);
        }
        var contentRoot = environment.ContentRootPath ?? Directory.GetCurrentDirectory();
        _brandingCachePath = Path.Combine(contentRoot, "App_Data", "BrandingCache");
        if (!Directory.Exists(_brandingCachePath))
        {
            Directory.CreateDirectory(_brandingCachePath);
        }
    }

    [HttpGet("session")]
    public async Task<IActionResult> GetSessionSettings()
    {
        var val = await GetSetting("Security:SessionTimeoutMinutes");
        int minutes = int.TryParse(val, out var m) ? m : 0;
        return Ok(new { sessionTimeoutMinutes = minutes });
    }

    [HttpPost("session")]
    public async Task<IActionResult> SaveSessionSettings([FromBody] System.Text.Json.JsonElement payload)
    {
        int minutes = payload.TryGetProperty("sessionTimeoutMinutes", out var m) && m.TryGetInt32(out var val) ? val : 0;
        await SaveSetting("Security:SessionTimeoutMinutes", minutes.ToString());
        await _context.SaveChangesAsync();
        return Ok(new { Message = "تنظیمات نشست کاربری ذخیره شد.", sessionTimeoutMinutes = minutes });
    }

    [HttpGet("security-policy")]
    public async Task<IActionResult> GetSecurityPolicy()
    {
        var policy = await _securityPolicyService.GetSecurityPolicyAsync();
        return Ok(policy);
    }

    [HttpPost("security-policy")]
    public async Task<IActionResult> SaveSecurityPolicy([FromBody] SecurityPolicyDto dto)
    {
        try
        {
            var saved = await _securityPolicyService.SaveSecurityPolicyAsync(dto);
            return Ok(new
            {
                message = "سیاست گذرواژه و امنیت حساب‌های محلی با موفقیت ذخیره شد.",
                policy = saved
            });
        }
        catch (ArgumentOutOfRangeException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("ad")]
    public async Task<IActionResult> GetADSettings()
    {
        var items = await _context.SystemSettings
            .Where(s => s.SettingKey.StartsWith("AD:"))
            .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

        var get = (string key) => items.TryGetValue(key, out var v) ? v : null;

        return Ok(new
        {
            domainName = get("AD:DomainName") ?? "company.local",
            ldapServer = get("AD:LdapServer") ?? "192.168.1.10",
            ldapPort = int.TryParse(get("AD:LdapPort") ?? "389", out var port) ? port : 389,
            serviceUser = get("AD:ServiceUser") ?? "service_user@company.local",
            servicePassword = get("AD:ServicePassword") ?? "",
            isEnabled = (get("AD:IsEnabled") ?? "false").Equals("true", StringComparison.OrdinalIgnoreCase)
        });
    }

    [HttpPost("ad")]
    public async Task<IActionResult> SaveADSettings([FromBody] System.Text.Json.JsonElement payload)
    {
        var domainName = payload.TryGetProperty("domainName", out var d) ? d.GetString() ?? "" : "";
        var ldapServer = payload.TryGetProperty("ldapServer", out var s) ? s.GetString() ?? "" : "";
        var ldapPort = payload.TryGetProperty("ldapPort", out var p) ? p.ToString() : "389";
        var serviceUser = payload.TryGetProperty("serviceUser", out var u) ? u.GetString() ?? "" : "";
        var servicePassword = payload.TryGetProperty("servicePassword", out var pwd) ? pwd.GetString() ?? "" : "";
        var isEnabled = payload.TryGetProperty("isEnabled", out var en) && en.GetBoolean() ? "true" : "false";

        await SaveSetting("AD:DomainName", domainName);
        await SaveSetting("AD:LdapServer", ldapServer);
        await SaveSetting("AD:LdapPort", ldapPort);
        await SaveSetting("AD:ServiceUser", serviceUser);
        if (!string.IsNullOrEmpty(servicePassword))
            await SaveSetting("AD:ServicePassword", servicePassword);
        await SaveSetting("AD:IsEnabled", isEnabled);

        await _context.SaveChangesAsync();
        return Ok(new { Message = "تنظیمات Active Directory با موفقیت ذخیره شد." });
    }

    [HttpPost("ad/test")]
    public async Task<IActionResult> TestAdConnection([FromBody] System.Text.Json.JsonElement payload)
    {
        var logs = new List<string>();
        try
        {
            string domainName = payload.TryGetProperty("domainName", out var d) ? d.GetString()?.Trim() ?? "" : "";
            string host = payload.TryGetProperty("ldapServer", out var h) ? h.GetString()?.Trim() ?? "" : "";
            int port = payload.TryGetProperty("ldapPort", out var p) && p.TryGetInt32(out var pt) ? pt : 389;
            string serviceUser = payload.TryGetProperty("serviceUser", out var u) ? u.GetString()?.Trim() ?? "" : "";
            string servicePassword = payload.TryGetProperty("servicePassword", out var pwd) ? pwd.GetString() ?? "" : "";

            if (string.IsNullOrEmpty(servicePassword))
                servicePassword = await GetSetting("AD:ServicePassword") ?? "";

            logs.Add($"[1/4] بررسی پارامترهای دامین: Domain={domainName} | Server={host}:{port} | User={serviceUser}");

            if (string.IsNullOrWhiteSpace(host))
                return Ok(new { success = false, message = "آدرس سرور LDAP وارد نشده است.", logs });
            if (string.IsNullOrWhiteSpace(domainName))
                return Ok(new { success = false, message = "نام دامنه (Domain Name) وارد نشده است.", logs });

            logs.Add($"[2/4] تست اتصال سوکت شبکه (TCP) به {host}:{port}...");
            using (var tcpClient = new TcpClient())
            {
                var connectTask = tcpClient.ConnectAsync(host, port);
                var completedTask = await Task.WhenAny(connectTask, Task.Delay(5000));
                if (completedTask != connectTask || !tcpClient.Connected)
                {
                    logs.Add($"[خطای شبکه] پورت {port} روی سرور دامین {host} پاسخ نداد (Timeout یا مسدود بودن فایروال).");
                    return Ok(new { success = false, message = $"عدم دسترسی به سرور دامین {host}:{port}.", logs });
                }
            }
            logs.Add($"[2/4] اتصال شبکه به {host}:{port} با موفقیت برقرار شد.");

            if (string.IsNullOrWhiteSpace(serviceUser) || string.IsNullOrWhiteSpace(servicePassword))
            {
                logs.Add("[3/4] هشدار: کلمه عبور حساب خدماتی وارد نشده است؛ فقط تست پورت شبکه انجام شد. برای تست احراز هویت (LDAP Bind)، کلمه عبور را وارد کنید.");
                return Ok(new { success = true, message = $"پورت {port} روی سرور {host} باز است (جهت تست احراز هویت، رمز حساب خدماتی را وارد نمایید).", logs });
            }

            var bindName = (serviceUser.Contains('@') || serviceUser.Contains('\\'))
                ? serviceUser
                : $"{serviceUser}@{domainName}";

            logs.Add($"[3/4] در حال احراز هویت (LDAP Bind) با حساب {bindName}...");

            var domainCn = await Task.Run(() =>
            {
                var identifier = new LdapDirectoryIdentifier(host, port);
                var credential = new NetworkCredential(bindName, servicePassword);

                using var connection = new LdapConnection(identifier, credential);
                connection.SessionOptions.ProtocolVersion = 3;
                connection.SessionOptions.SecureSocketLayer = port == 636;
                connection.SessionOptions.ReferralChasing = ReferralChasingOptions.None;
                connection.Timeout = TimeSpan.FromSeconds(10);

                connection.Bind();

                var baseDn = $"DC={string.Join(",DC=", domainName.Split('.'))}";
                var searchRequest = new SearchRequest(
                    baseDn,
                    "(objectClass=domain)",
                    SearchScope.Base,
                    new[] { "distinguishedName", "name" });

                var response = (SearchResponse)connection.SendRequest(searchRequest);
                return response.Entries.Count > 0 ? response.Entries[0].DistinguishedName : baseDn;
            });

            logs.Add($"[3/4] احراز هویت (LDAP Bind) با موفقیت انجام شد.");
            logs.Add($"[4/4] جستجوی ریشه دامین با موفقیت تایید شد: {domainCn}");

            return Ok(new { success = true, message = $"اتصال و احراز هویت با دامین {domainName} با موفقیت انجام شد.", logs });
        }
        catch (LdapException ldapEx)
        {
            logs.Add($"[خطای LDAP - کد {ldapEx.ErrorCode}] {ldapEx.ServerErrorMessage ?? ldapEx.Message}");
            return Ok(new { success = false, message = "خطای احراز هویت LDAP: " + ldapEx.Message, logs });
        }
        catch (Exception ex)
        {
            logs.Add($"[خطای سیستمی] {ex.Message}");
            return Ok(new { success = false, message = "خطا در تست اتصال دامین: " + ex.Message, logs });
        }
    }

    [HttpGet("email")]
    public async Task<IActionResult> GetEmailSettings()
    {
        var items = await _context.SystemSettings
            .Where(s => s.SettingKey.StartsWith("Email:"))
            .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

        var get = (string key) => items.TryGetValue(key, out var v) ? v : null;

        return Ok(new
        {
            smtpHost = get("Email:SmtpHost") ?? "192.168.1.25",
            smtpPort = int.TryParse(get("Email:SmtpPort") ?? "587", out var port) ? port : 587,
            smtpUser = get("Email:SmtpUser") ?? "noreply@company.local",
            smtpPassword = get("Email:SmtpPassword") ?? "",
            fromEmail = get("Email:FromEmail") ?? "bpms@company.local",
            fromName = get("Email:FromName") ?? "سامانه فرآیندهای سازمانی BPMS",
            enableSsl = (get("Email:EnableSsl") ?? "true").Equals("true", StringComparison.OrdinalIgnoreCase),
            sendOnInboxTask = (get("Email:SendOnInboxTask") ?? "true").Equals("true", StringComparison.OrdinalIgnoreCase),
            defaultSubject = get("Email:DefaultSubject") ?? "وظیفه جدید در کارتابل BPMS: {FormTitle}",
            defaultBody = get("Email:DefaultBody") ?? "با سلام،\nدرخواست جدیدی با کد رهگیری {TrackingCode} از طرف {SenderName} جهت بررسی در کارتابل شما ثبت شده است.\nجهت اقدام به سامانه مراجعه فرمایید:\n{PortalLink}"
        });
    }

    [HttpPost("email")]
    public async Task<IActionResult> SaveEmailSettings([FromBody] System.Text.Json.JsonElement payload)
    {
        var keys = new Dictionary<string, string?>
        {
            ["Email:SmtpHost"] = payload.TryGetProperty("smtpHost", out var h) ? h.GetString() : "192.168.1.25",
            ["Email:SmtpPort"] = payload.TryGetProperty("smtpPort", out var pt) ? pt.ToString() : "587",
            ["Email:SmtpUser"] = payload.TryGetProperty("smtpUser", out var u) ? u.GetString() : "",
            ["Email:SmtpPassword"] = payload.TryGetProperty("smtpPassword", out var pwd) ? pwd.GetString() : "",
            ["Email:FromEmail"] = payload.TryGetProperty("fromEmail", out var fe) ? fe.GetString() : "bpms@company.local",
            ["Email:FromName"] = payload.TryGetProperty("fromName", out var fn) ? fn.GetString() : "سامانه فرآیندهای سازمانی BPMS",
            ["Email:EnableSsl"] = payload.TryGetProperty("enableSsl", out var ssl) && ssl.GetBoolean() ? "true" : "false",
            ["Email:SendOnInboxTask"] = payload.TryGetProperty("sendOnInboxTask", out var sot) && sot.GetBoolean() ? "true" : "false",
            ["Email:DefaultSubject"] = payload.TryGetProperty("defaultSubject", out var ds) ? ds.GetString() : "وظیفه جدید در کارتابل BPMS: {FormTitle}",
            ["Email:DefaultBody"] = payload.TryGetProperty("defaultBody", out var db) ? db.GetString() : ""
        };

        foreach (var (k, v) in keys)
        {
            await SaveSetting(k, v ?? "");
        }
        await _context.SaveChangesAsync();
        return Ok(new { Message = "تنظیمات سرویس ایمیل با موفقیت ذخیره شد." });
    }

    [HttpPost("email/test")]
    public async Task<IActionResult> TestEmailConnection([FromBody] System.Text.Json.JsonElement payload)
    {
        var logs = new List<string>();
        try
        {
            string host = payload.TryGetProperty("smtpHost", out var h) ? h.GetString()?.Trim() ?? "" : "";
            int port = payload.TryGetProperty("smtpPort", out var p) && p.TryGetInt32(out var pt) ? pt : 587;
            string smtpUser = payload.TryGetProperty("smtpUser", out var u) ? u.GetString()?.Trim() ?? "" : "";
            string smtpPassword = payload.TryGetProperty("smtpPassword", out var pwd) ? pwd.GetString() ?? "" : "";
            string fromEmail = payload.TryGetProperty("fromEmail", out var fe) ? fe.GetString()?.Trim() ?? "" : "";
            string fromName = payload.TryGetProperty("fromName", out var fn) ? fn.GetString()?.Trim() ?? "BPMS" : "BPMS";
            bool enableSsl = payload.TryGetProperty("enableSsl", out var ssl) && ssl.GetBoolean();
            string toEmail = payload.TryGetProperty("toEmail", out var te) ? te.GetString()?.Trim() ?? "" : "";

            logs.Add($"[1/4] بررسی پارامترها: Server={host}:{port} | SSL={enableSsl} | From={fromEmail} | To={toEmail}");

            if (string.IsNullOrWhiteSpace(host))
                return Ok(new { success = false, message = "آدرس سرور SMTP وارد نشده است.", logs });
            if (string.IsNullOrWhiteSpace(fromEmail))
                return Ok(new { success = false, message = "آدرس ایمیل فرستنده وارد نشده است.", logs });
            if (string.IsNullOrWhiteSpace(toEmail))
                return Ok(new { success = false, message = "آدرس ایمیل گیرنده تست وارد نشده است.", logs });

            logs.Add($"[2/4] تست اتصال سوکت شبکه (TCP) به {host}:{port}...");
            using (var tcpClient = new TcpClient())
            {
                var connectTask = tcpClient.ConnectAsync(host, port);
                var completedTask = await Task.WhenAny(connectTask, Task.Delay(5000));
                if (completedTask != connectTask || !tcpClient.Connected)
                {
                    logs.Add($"[خطای شبکه] پورت {port} روی سرور {host} پاسخ نداد.");
                    return Ok(new { success = false, message = $"عدم دسترسی به سرور ایمیل {host}:{port}.", logs });
                }
            }
            logs.Add($"[2/4] اتصال شبکه به {host}:{port} با موفقیت برقرار شد.");

            logs.Add($"[3/4] پیکربندی کلاینت SMTP ({(string.IsNullOrEmpty(smtpUser) ? "Anonymous Relay" : $"کاربر: {smtpUser}")})...");
            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl,
                DeliveryMethod = SmtpDeliveryMethod.Network,
                Timeout = 10000
            };

            if (!string.IsNullOrWhiteSpace(smtpUser))
            {
                client.UseDefaultCredentials = false;
                client.Credentials = new NetworkCredential(smtpUser, smtpPassword);
            }

            using var message = new MailMessage
            {
                From = new MailAddress(fromEmail, fromName),
                Subject = "تست اتصال درگاه ایمیل سامانه BPMS",
                Body = $"با سلام،\nاین پیام آزمایشی جهت اطمینان از صحت ارسال ایمیل توسط سامانه BPMS در تاریخ {DateTime.Now:yyyy/MM/dd HH:mm:ss} ارسال شده است.",
                IsBodyHtml = false
            };
            message.To.Add(toEmail);

            logs.Add($"[4/4] در حال ارسال ایمیل به {toEmail}...");
            var prevCallback = ServicePointManager.ServerCertificateValidationCallback;
            try
            {
                ServicePointManager.ServerCertificateValidationCallback = (sender, certificate, chain, sslPolicyErrors) => true;
                await client.SendMailAsync(message);
            }
            finally
            {
                ServicePointManager.ServerCertificateValidationCallback = prevCallback;
            }
            logs.Add($"[موفق] ایمیل آزمایشی با موفقیت به سرور SMTP تحویل داده شد.");

            return Ok(new { success = true, message = $"ایمیل آزمایشی با موفقیت به {toEmail} ارسال شد.", logs });
        }
        catch (SmtpException smtpEx)
        {
            logs.Add($"[خطای SMTP - کد {smtpEx.StatusCode}] {smtpEx.Message}");
            if (smtpEx.InnerException != null)
                logs.Add($"[جزئیات داخلی] {smtpEx.InnerException.Message}");
            return Ok(new { success = false, message = "خطای پروتکل SMTP: " + smtpEx.Message, logs });
        }
        catch (Exception ex)
        {
            logs.Add($"[خطای سیستمی] {ex.Message}");
            return Ok(new { success = false, message = "خطا در ارسال ایمیل تست: " + ex.Message, logs });
        }
    }

    [HttpPost("upload-logo")]
    public async Task<IActionResult> UploadLogo(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest(new { Message = "فایلی انتخاب نشده است." });

        var allowedExtensions = new[] { ".png", ".jpg", ".jpeg" };
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(extension)) return BadRequest(new { Message = "فقط فایل‌های تصویری مجاز هستند." });

        foreach (var oldFile in Directory.GetFiles(_uploadsPath, "logo.*"))
        {
            try { System.IO.File.Delete(oldFile); } catch {}
        }

        var fileName = "logo" + extension;
        var filePath = Path.Combine(_uploadsPath, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var version = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var logoUrl = $"/uploads/{fileName}?v={version}";
        await SaveSetting("Branding:LogoUrl", logoUrl);
        await SaveSetting("Branding:Version", version);
        await _context.SaveChangesAsync();
        InvalidateBrandingCache();

        return Ok(new { logoUrl, version });
    }

    [HttpPost("branding")]
    public async Task<IActionResult> SaveBranding([FromBody] System.Text.Json.JsonElement payload)
    {
        var systemTitle = payload.TryGetProperty("systemTitle", out var st) ? st.GetString()?.Trim() : null;
        if (string.IsNullOrWhiteSpace(systemTitle))
            systemTitle = "نوافلو";

        var version = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        await SaveSetting("Branding:SystemTitle", systemTitle);
        await SaveSetting("Branding:Version", version);
        await _context.SaveChangesAsync();

        var logoUrl = await GetSetting("Branding:LogoUrl");
        if (string.IsNullOrEmpty(logoUrl) || logoUrl == "/uploads/logo.png" || logoUrl == "/branding/Logo.jpeg")
            logoUrl = "/branding/Logo.png";

        return Ok(new { logoUrl, systemTitle, version, message = "نام سامانه با موفقیت ذخیره شد." });
    }

    [HttpGet("branding")]
    [AllowAnonymous]
    public async Task<IActionResult> GetBranding()
    {
        var logoUrl = await GetSetting("Branding:LogoUrl");
        if (string.IsNullOrEmpty(logoUrl) || logoUrl == "/uploads/logo.png" || logoUrl == "/branding/Logo.jpeg")
            logoUrl = "/branding/Logo.png";

        var systemTitle = await GetSetting("Branding:SystemTitle");
        if (string.IsNullOrEmpty(systemTitle) || systemTitle == "درگاه فرآیندهای سازمانی")
            systemTitle = "نوافلو";

        var version = await GetSetting("Branding:Version") ?? "3";

        return Ok(new { logoUrl, systemTitle, version });
    }

    [HttpGet("/manifest.json")]
    [AllowAnonymous]
    public async Task<IActionResult> GetManifest()
    {
        var rawTitle = (await GetSetting("Branding:SystemTitle"))?.Trim();
        var isDefaultTitle = string.IsNullOrWhiteSpace(rawTitle) ||
                             rawTitle == "درگاه فرآیندهای سازمانی" ||
                             rawTitle == "نوافلو";

        var appName = isDefaultTitle ? "نوافلو - سامانه هوشمند فرآیندها" : rawTitle!;
        var shortName = isDefaultTitle
            ? "نوافلو"
            : (appName.Length > 30 ? appName[..30].Trim() : appName);

        var version = await GetSetting("Branding:Version") ?? "3";

        var manifest = new
        {
            id = "/",
            name = appName,
            short_name = shortName,
            description = "سامانه جامع فرم‌ساز پویا، موتور قوانین کسب‌وکار و گردش‌کار هوشمند سازمانی",
            lang = "fa",
            dir = "rtl",
            start_url = "/",
            scope = "/",
            display = "standalone",
            orientation = "any",
            background_color = "#0f172a",
            theme_color = "#0f172a",
            icons = new[]
            {
                new
                {
                    src = $"/api/branding/pwa-icon/192?v={version}",
                    sizes = "192x192",
                    type = "image/png",
                    purpose = "any"
                },
                new
                {
                    src = $"/api/branding/pwa-icon/512?v={version}",
                    sizes = "512x512",
                    type = "image/png",
                    purpose = "any"
                },
                new
                {
                    src = $"/api/branding/pwa-icon/maskable?v={version}",
                    sizes = "512x512",
                    type = "image/png",
                    purpose = "maskable"
                }
            }
        };

        Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        return new JsonResult(manifest)
        {
            ContentType = "application/manifest+json; charset=utf-8"
        };
    }

    [HttpGet("/api/branding/pwa-icon/{variant}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPwaIcon(string variant)
    {
        var normalized = (variant ?? "").Trim().ToLowerInvariant();
        var spec = normalized switch
        {
            "favicon" => (Size: 64, Margin: 0.06, Maskable: false, DefaultRelPath: "favicon.png"),
            "apple-touch" => (Size: 180, Margin: 0.06, Maskable: false, DefaultRelPath: "apple-touch-icon.png"),
            "192" => (Size: 192, Margin: 0.06, Maskable: false, DefaultRelPath: Path.Combine("icons", "icon-192x192.png")),
            "512" => (Size: 512, Margin: 0.06, Maskable: false, DefaultRelPath: Path.Combine("icons", "icon-512x512.png")),
            "maskable" => (Size: 512, Margin: 0.22, Maskable: true, DefaultRelPath: Path.Combine("icons", "icon-maskable-512x512.png")),
            _ => (Size: 0, Margin: 0.0, Maskable: false, DefaultRelPath: "")
        };

        if (spec.Size == 0)
            return NotFound();

        Response.Headers["Cache-Control"] = "no-cache, must-revalidate";

        var logoUrl = await GetSetting("Branding:LogoUrl");
        var version = await GetSetting("Branding:Version") ?? "3";

        string? customLogoPath = null;
        if (!string.IsNullOrWhiteSpace(logoUrl) &&
            !logoUrl.Equals("/branding/Logo.png", StringComparison.OrdinalIgnoreCase) &&
            !logoUrl.Equals("/branding/Logo.jpeg", StringComparison.OrdinalIgnoreCase))
        {
            var cleanRel = logoUrl.Split('?')[0].TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            var candidate = Path.Combine(_webRootPath, cleanRel);
            if (System.IO.File.Exists(candidate))
                customLogoPath = candidate;
        }

        if (customLogoPath == null)
        {
            var defaultPath = Path.Combine(_webRootPath, spec.DefaultRelPath);
            if (!System.IO.File.Exists(defaultPath))
                return NotFound();
            return PhysicalFile(defaultPath, "image/png");
        }

        var safeVersion = new string(version.Where(c => char.IsLetterOrDigit(c) || c == '-' || c == '_').ToArray());
        if (string.IsNullOrEmpty(safeVersion)) safeVersion = "1";
        var cachePath = Path.Combine(_brandingCachePath, $"{normalized}_{safeVersion}.png");

        if (!System.IO.File.Exists(cachePath))
        {
            GenerateContainedPwaIcon(customLogoPath, cachePath, spec.Size, spec.Margin, spec.Maskable);
        }

        return PhysicalFile(cachePath, "image/png");
    }

    private void InvalidateBrandingCache()
    {
        try
        {
            if (Directory.Exists(_brandingCachePath))
            {
                foreach (var f in Directory.GetFiles(_brandingCachePath, "*.png"))
                {
                    try { System.IO.File.Delete(f); } catch { }
                }
            }
        }
        catch { }
    }

    private static void GenerateContainedPwaIcon(string sourcePath, string destPath, int size, double marginRatio, bool maskable)
    {
        using var srcImg = Image.FromFile(sourcePath);
        using var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);

        g.Clear(maskable ? ColorTranslator.FromHtml("#0f172a") : Color.Transparent);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        var avail = size * (1.0 - 2.0 * marginRatio);
        var scale = Math.Min(avail / srcImg.Width, avail / srcImg.Height);
        var drawW = Math.Max(1, (int)Math.Round(srcImg.Width * scale));
        var drawH = Math.Max(1, (int)Math.Round(srcImg.Height * scale));
        var posX = (int)Math.Floor((size - drawW) / 2.0);
        var posY = (int)Math.Floor((size - drawH) / 2.0);

        g.DrawImage(srcImg, posX, posY, drawW, drawH);
        bmp.Save(destPath, ImageFormat.Png);
    }

    private async Task<string?> GetSetting(string key)
    {
        var rec = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == key);
        return rec?.SettingValue;
    }

    private async Task SaveSetting(string key, string value)
    {
        var rec = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == key);
        if (rec != null)
        {
            rec.SettingValue = value;
            rec.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _context.SystemSettings.Add(new SystemSetting
            {
                SettingKey = key,
                SettingValue = value,
                UpdatedAt = DateTime.UtcNow
            });
        }
    }
}