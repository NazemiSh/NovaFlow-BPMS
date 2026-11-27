namespace BPMS.Server.DTOs;

public class ConnectionDto
{
    public string Name { get; set; } = string.Empty;
    public string ServerAddress { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string AuthType { get; set; } = "Sql"; // "Sql" or "Windows"
    public string? Username { get; set; }
    public string? Password { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ConnectionResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ServerAddress { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public string AuthType { get; set; } = "Sql";
    public string? Username { get; set; }
    public bool HasPassword { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ConnectionTestRequestDto
{
    public int? ConnectionId { get; set; }
    public string? ServerAddress { get; set; }
    public string? DatabaseName { get; set; }
    public string? AuthType { get; set; } = "Sql";
    public string? Username { get; set; }
    public string? Password { get; set; }
}

public class ConnectionTestResultDto
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class TableColumnDef
{
    public string Name { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string DataType { get; set; } = "string"; // string, number, date
}

public class TableCreateUpdateDto
{
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string SourceType { get; set; } = "Manual"; // Manual, Excel, SqlQuery
    public int? ConnectionId { get; set; }
    public string? SqlQuery { get; set; }
    public string UniqueKeyColumn { get; set; } = "Id";
    public List<TableColumnDef> Columns { get; set; } = new();
    public string SyncScheduleType { get; set; } = "None"; // None, IntervalMinutes, DailyTime
    public string? SyncScheduleValue { get; set; }
    public string? ScheduleConfigJson { get; set; }
    public string? FilterRulesJson { get; set; }
    public string? ExcludedKeysJson { get; set; }
    public bool IsActive { get; set; } = true;
}

public class TableResponseDto
{
    public int Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string SourceType { get; set; } = "Manual";
    public int? ConnectionId { get; set; }
    public string? ConnectionName { get; set; }
    public string? SqlQuery { get; set; }
    public string UniqueKeyColumn { get; set; } = "Id";
    public List<TableColumnDef> Columns { get; set; } = new();
    public string SyncScheduleType { get; set; } = "None";
    public string? SyncScheduleValue { get; set; }
    public string? ScheduleConfigJson { get; set; }
    public DateTime? NextRunAt { get; set; }
    public string? FilterRulesJson { get; set; }
    public string? ExcludedKeysJson { get; set; }
    public DateTime? LastSyncAt { get; set; }
    public string? LastSyncStatus { get; set; }
    public string? LastSyncError { get; set; }
    public int RecordCount { get; set; }
    public string? VersionHash { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public class PreviewSqlRequestDto
{
    public int? ConnectionId { get; set; }
    public string? ServerAddress { get; set; }
    public string? DatabaseName { get; set; }
    public string? AuthType { get; set; } = "Sql";
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string SqlQuery { get; set; } = string.Empty;
}

public class PreviewSqlResultDto
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public List<TableColumnDef> Columns { get; set; } = new();
    public List<Dictionary<string, object?>> SampleRows { get; set; } = new();
}

public class PreviewSqlFullRequestDto
{
    public int? ConnectionId { get; set; }
    public string? ServerAddress { get; set; }
    public string? DatabaseName { get; set; }
    public string? AuthType { get; set; } = "Sql";
    public string? Username { get; set; }
    public string? Password { get; set; }
    public string SqlQuery { get; set; } = string.Empty;
    public int MaxRows { get; set; } = 20000;
}

public class PreviewSqlFullResultDto
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public List<TableColumnDef> Columns { get; set; } = new();
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
    public int TotalCount { get; set; }
    public bool IsTruncated { get; set; }
}

public class FilterRuleDto
{
    public string Column { get; set; } = string.Empty;
    public string Operator { get; set; } = "contains"; // equals, not_equals, contains, not_contains, starts_with, gt, lt, is_not_empty
    public string? Value { get; set; }
}

public class RecordItemDto
{
    public long Id { get; set; }
    public int TableId { get; set; }
    public string UniqueKeyValue { get; set; } = string.Empty;
    public Dictionary<string, object?> Data { get; set; } = new();
    public bool IsActive { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class RecordCreateUpdateDto
{
    public string UniqueKeyValue { get; set; } = string.Empty;
    public Dictionary<string, object?> Data { get; set; } = new();
    public bool IsActive { get; set; } = true;
}

public class TableRecordsResponseDto
{
    public bool UpToDate { get; set; }
    public string? VersionHash { get; set; }
    public List<TableColumnDef> Columns { get; set; } = new();
    public List<RecordItemDto> Records { get; set; } = new();
}

public class ExcelPreviewColumnDto
{
    public string SourceHeader { get; set; } = string.Empty;
    public string SuggestedName { get; set; } = string.Empty;
    public string SuggestedTitle { get; set; } = string.Empty;
    public string SuggestedDataType { get; set; } = "string";
}

public class ExcelColumnValidationDto
{
    public int EmptyCount { get; set; }
    public int DuplicateCount { get; set; }
    public List<int> SampleEmptyRowNumbers { get; set; } = new();
    public List<string> SampleDuplicateValues { get; set; } = new();
}

public class ExcelPreviewResultDto
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string FileName { get; set; } = string.Empty;
    public List<string> SheetNames { get; set; } = new();
    public string SelectedSheetName { get; set; } = string.Empty;
    public List<ExcelPreviewColumnDto> Columns { get; set; } = new();
    public int TotalRows { get; set; }
    public List<Dictionary<string, object?>> PreviewRows { get; set; } = new();
    public Dictionary<string, ExcelColumnValidationDto> ColumnStats { get; set; } = new();
}

public class ExcelColumnMappingDto
{
    public string SourceHeader { get; set; } = string.Empty;
    public string TargetColumnName { get; set; } = string.Empty;
}

public class MasterDataImportResultDto
{
    public string Message { get; set; } = string.Empty;
    public TableResponseDto Table { get; set; } = new();
    public int ImportedCount { get; set; }
    public int InsertedCount { get; set; }
    public int UpdatedCount { get; set; }
    public int SkippedCount { get; set; }
}
