using BPMS.Server.Models.Dtos;

namespace BPMS.Server.Services;

public interface ILicenseService
{
    Task<string> GetMachineIdAsync();
    Task<LicenseStatusDto> GetLicenseStatusAsync();
    Task<LicenseValidationResult> ValidateLicenseAsync(string? licenseKey = null);
    Task<(bool Success, string Message, LicenseStatusDto? Status)> ActivateLicenseAsync(string licenseKey);
    Task<bool> RemoveLicenseAsync();
    Task RecordActivityAsync();
}
