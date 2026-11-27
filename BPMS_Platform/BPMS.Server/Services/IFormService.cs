namespace BPMS.Server.Services;

using BPMS.Server.DTOs;

/// <summary>
/// Service for managing dynamic form definitions (CRUD, publishing, export/import).
/// </summary>
public interface IFormService
{
    Task<IEnumerable<FormResponseDto>> GetAllFormsAsync(string? status = null);
    Task<FormResponseDto?> GetFormByIdAsync(int formId);
    Task<FormResponseDto> CreateFormAsync(CreateFormDto dto, int currentUserId);
    Task<FormResponseDto?> UpdateFormAsync(int formId, UpdateFormDto dto, int currentUserId);
    Task<bool> PublishFormAsync(int formId, int currentUserId);
    Task<FormExportDto?> ExportFormAsync(int formId);
    Task<FormResponseDto> ImportFormAsync(FormExportDto exportDto, int currentUserId);
    Task<bool> ToggleStatusAsync(int formId, int currentUserId);
    Task<bool> DeleteFormAsync(int formId, int currentUserId);
}
