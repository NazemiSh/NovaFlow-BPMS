using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using BPMS.Server.Models.Dtos;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly PasswordHasher _passwordHasher;
    private readonly IJwtService _jwtService;
    private readonly ILdapService _ldapService;
    private readonly ILicenseService _licenseService;
    private readonly ISecurityPolicyService _securityPolicyService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        ApplicationDbContext context,
        PasswordHasher passwordHasher,
        IJwtService jwtService,
        ILdapService ldapService,
        ILicenseService licenseService,
        ISecurityPolicyService securityPolicyService,
        IConfiguration configuration,
        ILogger<AuthController> logger)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _jwtService = jwtService;
        _ldapService = ldapService;
        _licenseService = licenseService;
        _securityPolicyService = securityPolicyService;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(LoginRequestDto request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var user = await _context.AppUsers
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Username == request.Username);

        if (user != null && !user.IsActive)
            return Unauthorized(new { Message = "حساب کاربری شما غیرفعال شده است." });

        var securityPolicy = await _securityPolicyService.GetSecurityPolicyAsync();

        // بررسی وضعیت قفل حساب برای حساب‌های محلی در برابر حملات Brute-Force
        if (user != null && !user.IsActiveDirectoryUser && securityPolicy.EnableAccountLockout && user.LockoutEnd.HasValue)
        {
            if (user.LockoutEnd.Value > DateTime.UtcNow)
            {
                var remainingMinutes = Math.Max(1, (int)Math.Ceiling((user.LockoutEnd.Value - DateTime.UtcNow).TotalMinutes));
                return StatusCode(StatusCodes.Status423Locked, new
                {
                    message = $"حساب کاربری شما به دلیل {securityPolicy.MaxFailedLoginAttempts} تلاش ناموفق پیاپی موقتاً قفل شده است. لطفاً پس از {remainingMinutes} دقیقه مجدداً تلاش نمایید یا جهت باز کردن قفل با مدیر سیستم تماس بگیرید."
                });
            }

            user.LockoutEnd = null;
            user.AccessFailedCount = 0;
        }

        // ۱. ورود محلی
        if (user != null && !user.IsActiveDirectoryUser && !string.IsNullOrEmpty(user.PasswordHash))
        {
            if (_passwordHasher.VerifyPassword(request.Password, user.PasswordHash))
            {
                user.AccessFailedCount = 0;
                user.LockoutEnd = null;
                user.LastLoginAt = DateTime.UtcNow;
                _context.AuditLogs.Add(new AuditLog
                {
                    UserID = user.UserID,
                    Username = user.Username,
                    Action = "LOGIN_LOCAL",
                    EntityName = "Auth",
                    Timestamp = DateTime.UtcNow,
                    IPAddress = Request.HttpContext.Connection.RemoteIpAddress?.ToString()
                });
                await _context.SaveChangesAsync();

                return await CreateLoginResponseAsync(user);
            }

            return await HandleFailedLocalLoginAsync(user, securityPolicy);
        }

        // ۲. ورود از طریق Active Directory (LDAP)
        var isLdapEnabled = await _ldapService.IsLdapEnabledAsync();
        if (!isLdapEnabled)
        {
            return await HandleFailedLocalLoginAsync(user, securityPolicy);
        }

        try
        {
            var ldapResult = await _ldapService.ValidateUserAsync(request.Username, request.Password);
            if (!ldapResult.Success)
            {
                if (user != null && !user.IsActiveDirectoryUser)
                {
                    return await HandleFailedLocalLoginAsync(user, securityPolicy, ldapResult.ErrorMessage);
                }
                return Unauthorized(new { message = ldapResult.ErrorMessage ?? "نام کاربری یا کلمه عبور در اکتیو دایرکتوری اشتباه است." });
            }

            if (user == null)
            {
                // بررسی سقف مجاز کاربران فعال در لایسنس قبل از ایجاد حساب جدید برای کاربر Active Directory
                var license = await _licenseService.ValidateLicenseAsync();
                var currentActiveUsers = await _context.AppUsers.CountAsync(u => u.IsActive);
                if (currentActiveUsers >= license.MaxUsers)
                {
                    return StatusCode(StatusCodes.Status403Forbidden, new
                    {
                        message = $"امکان ورود و ایجاد کاربر جدید وجود ندارد؛ سقف مجاز کاربران فعال در لایسنس ({license.MaxUsers} کاربر) تکمیل شده است. لطفاً با مدیر سیستم تماس بگیرید."
                    });
                }

                user = new AppUser
                {
                    Username = request.Username.Trim(),
                    DisplayName = string.IsNullOrWhiteSpace(ldapResult.DisplayName) ? request.Username.Trim() : ldapResult.DisplayName.Trim(),
                    Email = ldapResult.Email?.Trim(),
                    IsActiveDirectoryUser = true,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LastLoginAt = DateTime.UtcNow
                };
                _context.AppUsers.Add(user);
                await _context.SaveChangesAsync();
            }
            else
            {
                if (!user.IsActive)
                {
                    return Unauthorized(new { message = "حساب کاربری شما توسط مدیر سامانه غیرفعال شده است." });
                }

                user.IsActiveDirectoryUser = true;
                user.IsActive = true;
                user.AccessFailedCount = 0;
                user.LockoutEnd = null;
                if (!string.IsNullOrWhiteSpace(ldapResult.DisplayName)) user.DisplayName = ldapResult.DisplayName.Trim();
                if (!string.IsNullOrWhiteSpace(ldapResult.Email)) user.Email = ldapResult.Email.Trim();
                user.LastLoginAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }

            var defaultRole = await _context.AppRoles.FirstOrDefaultAsync(r => r.RoleName == "User")
                              ?? await _context.AppRoles.FirstOrDefaultAsync(r => r.RoleName == "Operator");
            if (defaultRole != null && !user.UserRoles.Any())
            {
                _context.AppUserRoles.Add(new AppUserRole
                {
                    UserID = user.UserID,
                    RoleID = defaultRole.RoleID,
                    AssignedAt = DateTime.UtcNow
                });
                await _context.SaveChangesAsync();
            }

            await _context.Entry(user).Collection(u => u.UserRoles).Query().Include(ur => ur.Role).ToListAsync();

            _context.AuditLogs.Add(new AuditLog
            {
                UserID = user.UserID,
                Username = user.Username,
                Action = "LOGIN_AD",
                EntityName = "Auth",
                Timestamp = DateTime.UtcNow,
                IPAddress = Request.HttpContext.Connection.RemoteIpAddress?.ToString(),
                Details = $"Active Directory login successful for {user.Username}"
            });
            await _context.SaveChangesAsync();

            return await CreateLoginResponseAsync(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Active Directory authentication exception for {Username}", request.Username);
            return StatusCode(StatusCodes.Status503ServiceUnavailable,
                new { message = $"خطا در اتصال به سرویس Active Directory: {ex.Message}" });
        }
    }

    [HttpPost("refresh")]
    [Authorize]
    public async Task<IActionResult> RefreshToken()
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!int.TryParse(userIdStr, out var userId))
            return Unauthorized();

        var user = await _context.AppUsers
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.UserID == userId && u.IsActive);

        if (user == null)
            return Unauthorized();

        return await CreateLoginResponseAsync(user);
    }

    private async Task<IActionResult> HandleFailedLocalLoginAsync(AppUser? user, SecurityPolicyDto policy, string? fallbackMessage = null)
    {
        if (user != null && !user.IsActiveDirectoryUser && policy.EnableAccountLockout)
        {
            if (user.LockoutEnd.HasValue && user.LockoutEnd.Value <= DateTime.UtcNow)
            {
                user.LockoutEnd = null;
                user.AccessFailedCount = 0;
            }

            user.AccessFailedCount++;
            if (user.AccessFailedCount >= policy.MaxFailedLoginAttempts)
            {
                user.LockoutEnd = DateTime.UtcNow.AddMinutes(policy.LockoutDurationMinutes);
                await _context.SaveChangesAsync();
                return StatusCode(StatusCodes.Status423Locked, new
                {
                    message = $"حساب کاربری شما به دلیل {policy.MaxFailedLoginAttempts} تلاش ناموفق پیاپی به مدت {policy.LockoutDurationMinutes} دقیقه قفل شد. جهت رفع قفل سریع با مدیر سیستم تماس بگیرید."
                });
            }

            await _context.SaveChangesAsync();
            var remainingAttempts = Math.Max(0, policy.MaxFailedLoginAttempts - user.AccessFailedCount);
            return Unauthorized(new
            {
                message = $"نام کاربری یا کلمه عبور اشتباه است. ({remainingAttempts} فرصت تلاش باقی مانده)"
            });
        }

        return Unauthorized(new { message = fallbackMessage ?? "نام کاربری یا کلمه عبور اشتباه است." });
    }

    private async Task<IActionResult> CreateLoginResponseAsync(AppUser user)
    {
        var licenseValidation = await _licenseService.ValidateLicenseAsync();
        if (licenseValidation.Status == "Expired")
        {
            var licenseStatus = await _licenseService.GetLicenseStatusAsync();
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                message = "دوره اعتبار لایسنس سامانه به پایان رسیده است. جهت ادامه فعالیت، لطفاً کلید لایسنس معتبر را ثبت نمایید.",
                status = "Expired",
                isTrial = licenseStatus.IsTrial,
                machineId = licenseStatus.MachineId,
                vendorInfo = licenseStatus.VendorInfo,
                organizationName = licenseStatus.OrganizationName,
                expiresAt = licenseStatus.ExpiresAtPersian
            });
        }

        var roles = user.UserRoles.Select(ur => ur.Role.RoleName).ToList();

        var timeoutSetting = await _context.SystemSettings
            .FirstOrDefaultAsync(s => s.SettingKey == "Security:SessionTimeoutMinutes");

        int timeoutMinutes = 0; // 0 = نامحدود (بدون خروج خودکار)
        if (timeoutSetting != null && int.TryParse(timeoutSetting.SettingValue, out var parsed))
        {
            timeoutMinutes = parsed;
        }

        var expiresAt = timeoutMinutes <= 0
            ? DateTime.UtcNow.AddYears(10)
            : DateTime.UtcNow.AddMinutes(timeoutMinutes);

        var jwtSecret = _configuration["Jwt:SecretKey"]!;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, user.UserID.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim("display_name", user.DisplayName ?? user.Username)
        };
        foreach (var r in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, r));
        }

        var tokenDescriptor = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"],
            audience: _configuration["Jwt:Audience"],
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds
        );

        var tokenString = new JwtSecurityTokenHandler().WriteToken(tokenDescriptor);

        return Ok(new
        {
            token = tokenString,
            displayName = user.DisplayName,
            username = user.Username,
            userID = user.UserID,
            roles = roles,
            expiresAt = expiresAt,
            sessionTimeoutMinutes = timeoutMinutes
        });
    }

    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var displayName = User.FindFirst("display_name")?.Value;
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value);

        return Ok(new
        {
            UserId = userId,
            DisplayName = displayName,
            Username = username,
            Roles = roles
        });
    }
}