using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("MasterDataTables", Schema = "dbo")]
public class MasterDataTable
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// SourceType: "Manual" | "Excel" | "SqlQuery"
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string SourceType { get; set; } = "Manual";

    public int? ConnectionId { get; set; }

    public string? SqlQuery { get; set; }

    [Required]
    [MaxLength(100)]
    public string UniqueKeyColumn { get; set; } = "Id";

    /// <summary>
    /// JSON array of column definitions: [{ "name": "...", "title": "...", "dataType": "string"|"number"|"date" }]
    /// </summary>
    [Required]
    public string ColumnsJson { get; set; } = "[]";

    /// <summary>
    /// SyncScheduleType: "None" | "IntervalMinutes" | "DailyTime" (Legacy compatibility)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string SyncScheduleType { get; set; } = "None";

    [MaxLength(100)]
    public string? SyncScheduleValue { get; set; }

    /// <summary>
    /// Advanced Power BI-style schedule configuration JSON
    /// </summary>
    public string? ScheduleConfigJson { get; set; }

    public DateTime? NextRunAt { get; set; }

    /// <summary>
    /// JSON array of column filter rules: [{ "column": "...", "operator": "equals|not_equals|contains|not_contains|starts_with|gt|lt|is_not_empty", "value": "..." }]
    /// </summary>
    public string? FilterRulesJson { get; set; }

    /// <summary>
    /// JSON array of excluded unique keys: ["key1", "key2"]
    /// </summary>
    public string? ExcludedKeysJson { get; set; }

    public DateTime? LastSyncAt { get; set; }

    [MaxLength(50)]
    public string? LastSyncStatus { get; set; }

    public string? LastSyncError { get; set; }

    public int RecordCount { get; set; } = 0;

    [MaxLength(64)]
    public string? VersionHash { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [ForeignKey(nameof(ConnectionId))]
    public virtual MasterDataConnection? Connection { get; set; }

    public virtual ICollection<MasterDataRecord> Records { get; set; } = new List<MasterDataRecord>();
}
