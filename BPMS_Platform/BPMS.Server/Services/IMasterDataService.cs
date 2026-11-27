using BPMS.Server.DTOs;

namespace BPMS.Server.Services;

public interface IMasterDataService
{
    // Connections
    Task<List<ConnectionResponseDto>> GetConnectionsAsync();
    Task<ConnectionResponseDto> GetConnectionByIdAsync(int id);
    Task<ConnectionResponseDto> CreateConnectionAsync(ConnectionDto dto);
    Task<ConnectionResponseDto> UpdateConnectionAsync(int id, ConnectionDto dto);
    Task DeleteConnectionAsync(int id);
    Task<ConnectionTestResultDto> TestConnectionAsync(ConnectionTestRequestDto dto);

    // SQL Safety & Preview
    Task<PreviewSqlResultDto> PreviewSqlSchemaAsync(PreviewSqlRequestDto dto);
    Task<PreviewSqlFullResultDto> PreviewSqlFullAsync(PreviewSqlFullRequestDto dto);
    bool ValidateReadOnlyQuery(string sqlQuery, out string? errorMessage);

    // Tables
    Task<List<TableResponseDto>> GetTablesAsync();
    Task<TableResponseDto> GetTableByIdAsync(int id);
    Task<TableResponseDto> CreateTableAsync(TableCreateUpdateDto dto);
    Task<TableResponseDto> UpdateTableAsync(int id, TableCreateUpdateDto dto);
    Task DeleteTableAsync(int id);

    // Sync & Import
    Task<TableResponseDto> SyncTableAsync(int tableId);
    Task<MasterDataImportResultDto> ImportDataAsync(int tableId, Stream fileStream, string fileName, string? sheetName = null, List<ExcelColumnMappingDto>? columnMappings = null);
    Task CheckAndRunScheduledSyncsAsync(CancellationToken ct = default);

    // Records
    Task<TableRecordsResponseDto> GetTableRecordsAsync(int tableId, string? clientVersionHash);
    Task<List<RecordItemDto>> LookupRecordsAsync(int tableId, string? query, int limit = 20);
    Task<(List<RecordItemDto> Items, int TotalCount)> GetManageRecordsAsync(int tableId, int page, int pageSize, string? search);
    Task<RecordItemDto> AddRecordAsync(int tableId, RecordCreateUpdateDto dto);
    Task<RecordItemDto> UpdateRecordAsync(int tableId, long recordId, RecordCreateUpdateDto dto);
    Task ToggleRecordStatusAsync(int tableId, long recordId);
}
