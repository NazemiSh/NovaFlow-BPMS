using System.Text.Json.Serialization;

namespace BPMS.Server.DTOs;

public class BackupRequestDto
{
    public List<string> Modules { get; set; } = new() { "users", "forms", "data", "settings", "uploads" };
    public bool SaveToServer { get; set; } = false;
    public string? CustomNote { get; set; }
    public string? CustomStoragePath { get; set; }
}

public class BackupFileInfo
{
    public string FileName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public string FileSizeFormatted { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public string CreatedAtPersian { get; set; } = string.Empty;
    public string BackupType { get; set; } = "Manual"; // Manual or Scheduled
    public List<string> Modules { get; set; } = new();
    public string? CustomNote { get; set; }
    public BackupManifest? Manifest { get; set; }
}

public class BackupManifest
{
    public string BackupVersion { get; set; } = "1.0";
    public string SystemVersion { get; set; } = "1.0.0";
    public DateTime CreatedAtUtc { get; set; }
    public string CreatedAtPersian { get; set; } = string.Empty;
    public string BackupType { get; set; } = "Manual";
    public string? CustomNote { get; set; }
    public List<string> Modules { get; set; } = new();
    public Dictionary<string, int> ItemCounts { get; set; } = new();
    public Dictionary<string, string> ModuleSummaries { get; set; } = new();
}

public class RestoreRequestDto
{
    public string? FileName { get; set; }
    public List<string>? SelectedModules { get; set; }
}

public class RestoreResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<string> RestoredModules { get; set; } = new();
    public Dictionary<string, int> RestoredCounts { get; set; } = new();
    public List<string> Errors { get; set; } = new();
}

public class ScheduleConfigDto
{
    public bool IsEnabled { get; set; } = false;
    // Date settings
    public string DateMode { get; set; } = "recurring"; // "recurring" or "specificDate"
    public string RecurrenceType { get; set; } = "daily"; // "daily", "weekly", "monthly"
    public List<string> DaysOfWeek { get; set; } = new() { "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday" };
    public int DayOfMonth { get; set; } = 1;
    public string? SpecificDate { get; set; } // Persian date e.g. 1405/08/25
    public string SpecificDateRepeat { get; set; } = "none"; // "none", "daily", "weekly", "monthly"

    // Time settings
    public string StartTime { get; set; } = "02:00"; // "HH:mm"
    public bool ContinueRunningIntraDay { get; set; } = false;
    public int IntraDayIntervalHours { get; set; } = 2; // 1, 2, 4, 6, 12
    public string LastRunTime { get; set; } = "22:00"; // "HH:mm"

    // Storage & Retention
    public string StoragePath { get; set; } = "App_Data/Backups";
    public int MaxRetainedBackups { get; set; } = 10;
    public List<string> Modules { get; set; } = new() { "users", "forms", "data", "settings", "uploads" };

    // Execution status tracking
    public DateTime? LastRunAtUtc { get; set; }
    public string? LastRunAtPersian { get; set; }
    public string? LastRunStatus { get; set; } // "Success", "Failed"
    public string? LastRunMessage { get; set; }
    public DateTime? NextRunAtUtc { get; set; }
    public string? NextRunAtPersian { get; set; }
}

public class BackupStatusResponse
{
    public ScheduleConfigDto Schedule { get; set; } = new();
    public string ResolvedStoragePath { get; set; } = string.Empty;
    public long StorageFreeSpaceBytes { get; set; }
    public string StorageFreeSpaceFormatted { get; set; } = string.Empty;
    public int TotalBackupsCount { get; set; }
    public long TotalBackupsSizeBytes { get; set; }
    public string TotalBackupsSizeFormatted { get; set; } = string.Empty;
}
