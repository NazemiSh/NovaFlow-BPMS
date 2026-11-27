namespace BPMS.Server.Models.Dtos;

public class LicensePayload
{
    public string OrganizationName { get; set; } = string.Empty;
    public string MachineId { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public int MaxUsers { get; set; }
    public bool EnableAiModule { get; set; }
}

public class LicenseValidationResult
{
    public bool IsValid { get; set; }
    public string Status { get; set; } = "Trial"; // "Active", "Trial", "Expired", "Invalid"
    public bool IsTrial { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public DateTime? ExpiresAt { get; set; }
    public int MaxUsers { get; set; }
    public bool EnableAiModule { get; set; }
    public string? ErrorMessage { get; set; }
}

public class LicenseStatusDto
{
    public string MachineId { get; set; } = string.Empty;
    public string Status { get; set; } = "Trial"; // "Active", "Trial", "Expired", "Invalid"
    public bool IsTrial { get; set; }
    public string OrganizationName { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public string ExpiresAtIso { get; set; } = string.Empty;
    public string ExpiresAtPersian { get; set; } = string.Empty;
    public int DaysRemaining { get; set; }
    public int MaxUsers { get; set; }
    public int ActiveUsersCount { get; set; }
    public bool EnableAiModule { get; set; }
    public string Version { get; set; } = "1.0.0";
    public VendorInfoDto VendorInfo { get; set; } = new();
}

public class VendorInfoDto
{
    public string CompanyName { get; set; } = "Shahab Nazemi";
    public string Email { get; set; } = "shahab.nazemi@gmail.com";
    public string Phone { get; set; } = "0900-000-0000";
    public string Website { get; set; } = "https://github.com/NazemiSh/NovaFlow-BPMS";
    public string WhatsappUrl { get; set; } = "https://wa.me/qr/X7NJ6BHTONWWF1";
    public string RepositoryUrl { get; set; } = "https://github.com/NazemiSh/NovaFlow-BPMS";
}

public class ActivateLicenseRequestDto
{
    public string LicenseKey { get; set; } = string.Empty;
}

public class UpdateCheckResultDto
{
    public string Status { get; set; } = "Offline"; // "Online", "Offline"
    public bool IsOffline { get; set; } = true;
    public string CurrentVersion { get; set; } = "1.0.0";
    public bool HasUpdate { get; set; }
    public string? LatestVersion { get; set; }
    public string? ReleaseDate { get; set; }
    public string? PublishedAt { get; set; }
    public string? Title { get; set; }
    public string? ReleaseUrl { get; set; }
    public string? AssetDownloadUrl { get; set; }
    public long? AssetSize { get; set; }
    public List<string> Changelog { get; set; } = new();
    public string RepositoryUrl { get; set; } = "https://github.com/NazemiSh/NovaFlow-BPMS";
    public string? Message { get; set; }
    public DateTime CheckedAt { get; set; } = DateTime.UtcNow;
}

public class UpdateStatusDto
{
    public string State { get; set; } = "Idle"; // Idle, Downloading, BackingUp, Deploying, Verifying, Completed, Failed, RolledBack
    public int Step { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? CurrentVersion { get; set; }
    public string? TargetVersion { get; set; }
    public string? Error { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
