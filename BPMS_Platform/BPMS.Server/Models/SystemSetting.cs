using System.ComponentModel.DataAnnotations;

namespace BPMS.Server.Models;

/// <summary>
/// ذخیره تنظیمات پویای سامانه (AD / LDAP + برندینگ).
/// </summary>
public class SystemSetting
{
    [Key]
    [MaxLength(100)]
    public string SettingKey { get; set; } = string.Empty;

    public string SettingValue { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}