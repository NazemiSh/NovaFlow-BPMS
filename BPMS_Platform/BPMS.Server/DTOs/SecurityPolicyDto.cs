namespace BPMS.Server.DTOs;

public class SecurityPolicyDto
{
    public bool EnablePasswordPolicy { get; set; } = false;
    public int MinPasswordLength { get; set; } = 6;
    public bool RequireUppercase { get; set; } = false;
    public bool RequireLowercase { get; set; } = false;
    public bool RequireDigit { get; set; } = false;
    public bool RequireSpecialChar { get; set; } = false;

    public bool EnableAccountLockout { get; set; } = true;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutDurationMinutes { get; set; } = 15;
}
