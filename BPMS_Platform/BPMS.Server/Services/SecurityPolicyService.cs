using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public interface ISecurityPolicyService
{
    Task<SecurityPolicyDto> GetSecurityPolicyAsync();
    Task<SecurityPolicyDto> SaveSecurityPolicyAsync(SecurityPolicyDto dto);
    Task<(bool IsValid, string? ErrorMessage, List<string> Errors)> ValidatePasswordAsync(string? password);
    (bool IsValid, string? ErrorMessage, List<string> Errors) ValidatePassword(string? password, SecurityPolicyDto policy);
}

public class SecurityPolicyService : ISecurityPolicyService
{
    private const string KeyEnablePasswordPolicy = "Security:EnablePasswordPolicy";
    private const string KeyMinPasswordLength = "Security:MinPasswordLength";
    private const string KeyRequireUppercase = "Security:RequireUppercase";
    private const string KeyRequireLowercase = "Security:RequireLowercase";
    private const string KeyRequireDigit = "Security:RequireDigit";
    private const string KeyRequireSpecialChar = "Security:RequireSpecialChar";
    private const string KeyEnableAccountLockout = "Security:EnableAccountLockout";
    private const string KeyMaxFailedLoginAttempts = "Security:MaxFailedLoginAttempts";
    private const string KeyLockoutDurationMinutes = "Security:LockoutDurationMinutes";

    private readonly ApplicationDbContext _context;

    public SecurityPolicyService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<SecurityPolicyDto> GetSecurityPolicyAsync()
    {
        var items = await _context.SystemSettings
            .Where(s => s.SettingKey.StartsWith("Security:"))
            .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

        string? GetVal(string key) => items.TryGetValue(key, out var v) ? v : null;
        bool ParseBool(string key, bool fallback)
        {
            var raw = GetVal(key);
            if (string.IsNullOrWhiteSpace(raw)) return fallback;
            return bool.TryParse(raw, out var b) ? b : fallback;
        }
        int ParseInt(string key, int fallback, int min, int max)
        {
            var raw = GetVal(key);
            if (string.IsNullOrWhiteSpace(raw) || !int.TryParse(raw, out var val)) return fallback;
            return Math.Clamp(val, min, max);
        }

        return new SecurityPolicyDto
        {
            EnablePasswordPolicy = ParseBool(KeyEnablePasswordPolicy, false),
            MinPasswordLength = ParseInt(KeyMinPasswordLength, 6, 6, 32),
            RequireUppercase = ParseBool(KeyRequireUppercase, false),
            RequireLowercase = ParseBool(KeyRequireLowercase, false),
            RequireDigit = ParseBool(KeyRequireDigit, false),
            RequireSpecialChar = ParseBool(KeyRequireSpecialChar, false),
            EnableAccountLockout = ParseBool(KeyEnableAccountLockout, true),
            MaxFailedLoginAttempts = ParseInt(KeyMaxFailedLoginAttempts, 5, 1, 50),
            LockoutDurationMinutes = ParseInt(KeyLockoutDurationMinutes, 15, 1, 1440)
        };
    }

    public async Task<SecurityPolicyDto> SaveSecurityPolicyAsync(SecurityPolicyDto dto)
    {
        if (dto.MinPasswordLength < 6 || dto.MinPasswordLength > 32)
        {
            throw new ArgumentOutOfRangeException(nameof(dto.MinPasswordLength), "حداقل طول رمز عبور باید بین ۶ تا ۳۲ کاراکتر باشد.");
        }
        if (dto.MaxFailedLoginAttempts < 1 || dto.MaxFailedLoginAttempts > 50)
        {
            throw new ArgumentOutOfRangeException(nameof(dto.MaxFailedLoginAttempts), "تعداد تلاش ناموفق مجاز پیش از قفل شدن باید بین ۱ تا ۵۰ بار باشد.");
        }
        if (dto.LockoutDurationMinutes < 1 || dto.LockoutDurationMinutes > 1440)
        {
            throw new ArgumentOutOfRangeException(nameof(dto.LockoutDurationMinutes), "مدت قفل ماندن حساب باید بین ۱ تا ۱۴۴۰ دقیقه باشد.");
        }

        var normalized = new SecurityPolicyDto
        {
            EnablePasswordPolicy = dto.EnablePasswordPolicy,
            MinPasswordLength = dto.MinPasswordLength,
            RequireUppercase = dto.RequireUppercase,
            RequireLowercase = dto.RequireLowercase,
            RequireDigit = dto.RequireDigit,
            RequireSpecialChar = dto.RequireSpecialChar,
            EnableAccountLockout = dto.EnableAccountLockout,
            MaxFailedLoginAttempts = dto.MaxFailedLoginAttempts,
            LockoutDurationMinutes = dto.LockoutDurationMinutes
        };

        var pairs = new Dictionary<string, string>
        {
            [KeyEnablePasswordPolicy] = normalized.EnablePasswordPolicy ? "true" : "false",
            [KeyMinPasswordLength] = normalized.MinPasswordLength.ToString(),
            [KeyRequireUppercase] = normalized.RequireUppercase ? "true" : "false",
            [KeyRequireLowercase] = normalized.RequireLowercase ? "true" : "false",
            [KeyRequireDigit] = normalized.RequireDigit ? "true" : "false",
            [KeyRequireSpecialChar] = normalized.RequireSpecialChar ? "true" : "false",
            [KeyEnableAccountLockout] = normalized.EnableAccountLockout ? "true" : "false",
            [KeyMaxFailedLoginAttempts] = normalized.MaxFailedLoginAttempts.ToString(),
            [KeyLockoutDurationMinutes] = normalized.LockoutDurationMinutes.ToString()
        };

        var existingSettings = await _context.SystemSettings
            .Where(s => pairs.Keys.Contains(s.SettingKey))
            .ToDictionaryAsync(s => s.SettingKey);

        foreach (var (key, value) in pairs)
        {
            if (existingSettings.TryGetValue(key, out var rec))
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

        await _context.SaveChangesAsync();
        return normalized;
    }

    public async Task<(bool IsValid, string? ErrorMessage, List<string> Errors)> ValidatePasswordAsync(string? password)
    {
        var policy = await GetSecurityPolicyAsync();
        return ValidatePassword(password, policy);
    }

    public (bool IsValid, string? ErrorMessage, List<string> Errors) ValidatePassword(string? password, SecurityPolicyDto policy)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(password))
        {
            errors.Add("کلمه عبور نمی‌تواند خالی باشد.");
            return (false, errors[0], errors);
        }

        if (!policy.EnablePasswordPolicy)
        {
            return (true, null, errors);
        }

        if (password.Length < policy.MinPasswordLength)
        {
            errors.Add($"طول کلمه عبور باید حداقل {policy.MinPasswordLength} کاراکتر باشد.");
        }

        if (policy.RequireUppercase && !password.Any(c => c >= 'A' && c <= 'Z'))
        {
            errors.Add("کلمه عبور باید حداقل شامل یک حرف بزرگ انگلیسی (A-Z) باشد.");
        }

        if (policy.RequireLowercase && !password.Any(c => c >= 'a' && c <= 'z'))
        {
            errors.Add("کلمه عبور باید حداقل شامل یک حرف کوچک انگلیسی (a-z) باشد.");
        }

        if (policy.RequireDigit && !password.Any(c => c >= '0' && c <= '9'))
        {
            errors.Add("کلمه عبور باید حداقل شامل یک عدد (0-9) باشد.");
        }

        if (policy.RequireSpecialChar && !password.Any(c => !char.IsLetterOrDigit(c) && !char.IsWhiteSpace(c)))
        {
            errors.Add("کلمه عبور باید حداقل شامل یک کاراکتر ویژه (مانند !@#$%^&*) باشد.");
        }

        if (errors.Count > 0)
        {
            var combined = "کلمه عبور با سیاست امنیتی سامانه مطابقت ندارد: " + string.Join(" | ", errors);
            return (false, combined, errors);
        }

        return (true, null, errors);
    }
}
