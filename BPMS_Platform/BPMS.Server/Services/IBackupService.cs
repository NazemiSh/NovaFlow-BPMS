using BPMS.Server.DTOs;

namespace BPMS.Server.Services;

public interface IBackupService
{
    Task<byte[]> CreateBackupZipAsync(List<string> modules, string? customNote = null, string backupType = "Manual");
    Task<BackupFileInfo> CreateAndSaveBackupAsync(List<string> modules, string? customNote = null, string backupType = "Manual", string? customStoragePath = null);
    Task<List<BackupFileInfo>> GetBackupFilesAsync(string? customStoragePath = null);
    Task<BackupManifest> PreviewBackupAsync(Stream zipStream);
    Task<BackupManifest> PreviewBackupFileAsync(string fileName, string? customStoragePath = null);
    Task<RestoreResult> RestoreBackupAsync(Stream zipStream, List<string>? selectedModules = null);
    Task<RestoreResult> RestoreBackupFileAsync(string fileName, List<string>? selectedModules = null, string? customStoragePath = null);
    Task<bool> DeleteBackupFileAsync(string fileName, string? customStoragePath = null);
    Task<ScheduleConfigDto> GetScheduleConfigAsync();
    Task SaveScheduleConfigAsync(ScheduleConfigDto config);
    Task ApplyRetentionPolicyAsync(string? customStoragePath = null, int maxRetained = 10);
    string GetResolvedStoragePath(string? customPath = null);
    Task<BackupStatusResponse> GetBackupStatusAsync();
}
