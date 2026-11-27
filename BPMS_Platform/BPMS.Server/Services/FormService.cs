namespace BPMS.Server.Services;

using System.Data;
using System.Text.Json;
using System.Linq;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Service implementation for form definition management.
/// Validates JSON schemas, manages version/revision lifecycle, and handles export/import.
/// </summary>
public class FormService : IFormService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<FormService> _logger;

    public FormService(ApplicationDbContext context, ILogger<FormService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IEnumerable<FormResponseDto>> GetAllFormsAsync(string? status = null)
    {
        var query = _context.Forms.AsQueryable();
        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(f => f.Status == status);
        }

        var forms = await query
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync();

        return forms.Select(f => MapToDto(f));
    }

    public async Task<FormResponseDto?> GetFormByIdAsync(int formId)
    {
        var form = await _context.Forms.FindAsync(formId);
        return form == null ? null : MapToDto(form);
    }

    public async Task<FormResponseDto> CreateFormAsync(CreateFormDto dto, int currentUserId)
    {
        bool isPublic = false;
        try
        {
            using var doc = JsonDocument.Parse(dto.SchemaJson);
            if (doc.RootElement.TryGetProperty("isPublic", out var pubProp))
                isPublic = pubProp.GetBoolean();
        }
        catch {}

        var form = new FormDefinition
        {
            FormCode = $"FORM-{Guid.NewGuid():N}",
            Title = dto.Title,
            Description = dto.Description,
            Tags = dto.Category,
            Category = dto.Category ?? "سازمانی",
            SchemaJSON = dto.SchemaJson,
            IsPublic = isPublic,
            PublicToken = GeneratePublicToken(),
            IsBiIntegrated = false,
            Status = "Draft",
            Version = 1,
            Revision = 0,
            CreatedByUserID = currentUserId,
            CreatedAt = DateTime.UtcNow
        };

        _context.Forms.Add(form);
        await _context.SaveChangesAsync();

        await LogActionAsync(form.FormID, currentUserId, "Create", $"Created form '{form.Title}' (version {form.Version}, revision {form.Revision}).");

        _logger.LogInformation("Form created: FormID={FormID}, Title={Title}", form.FormID, form.Title);
        return MapToDto(form);
    }

    public async Task<FormResponseDto?> UpdateFormAsync(int formId, UpdateFormDto dto, int currentUserId)
    {
        var form = await _context.Forms.FindAsync(formId);
        if (form == null)
        {
            _logger.LogWarning("Form not found for update: FormID={FormID}", formId);
            return null;
        }

        // Validate SchemaJson is non-empty and valid JSON.
        ValidateSchemaJson(dto.SchemaJson);

        var wasActive = form.Status == "Active";

        var updatedAt = DateTime.UtcNow;
        form.Title = dto.Title;
        form.Description = dto.Description;
        form.SchemaJSON = dto.SchemaJson;
        form.PublishedAt = wasActive ? form.PublishedAt : null;

        // Increment Revision when updating an already Active form.
        if (wasActive)
        {
            form.Revision++;
            _logger.LogInformation("Active form updated, revision incremented: FormID={FormID}, NewRevision={Revision}", formId, form.Revision);
        }

        await _context.SaveChangesAsync();

        return MapToDto(form, updatedAt);
    }

    public async Task<bool> PublishFormAsync(int formId, int currentUserId)
    {
        var form = await _context.Forms.FindAsync(formId);
        if (form == null)
        {
            _logger.LogWarning("Form not found for publish: FormID={FormID}", formId);
            return false;
        }

        if (form.Status == "Active")
        {
            _logger.LogWarning("Form already active: FormID={FormID}", formId);
            return false;
        }

        // Validate SchemaJson before publishing.
        ValidateSchemaJson(form.SchemaJSON);

        form.Status = "Active";
        form.PublishedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await LogActionAsync(form.FormID, currentUserId, "Publish", $"Published form '{form.Title}' to Active status.");
        _logger.LogInformation("Form published: FormID={FormID}, Title={Title}", formId, form.Title);
        return true;
    }

    public async Task<FormExportDto?> ExportFormAsync(int formId)
    {
        var form = await _context.Forms.FindAsync(formId);
        if (form == null)
        {
            _logger.LogWarning("Form not found for export: FormID={FormID}", formId);
            return null;
        }

        var exportDto = new FormExportDto
        {
            Format = FormExportDto.FormatIdentifier,
            Title = form.Title,
            Description = form.Description,
            SchemaJson = form.SchemaJSON,
            SettingsJson = null,
            ExportedAt = DateTime.UtcNow
        };

        await LogActionAsync(form.FormID, form.CreatedByUserID, "Export", $"Exported form '{form.Title}' (version {form.Version}, revision {form.Revision}).");
        _logger.LogInformation("Form exported: FormID={FormID}", formId);
        return exportDto;
    }

    public async Task<FormResponseDto> ImportFormAsync(FormExportDto exportDto, int currentUserId)
    {
        // Validate the export format identifier.
        if (string.IsNullOrEmpty(exportDto.Format) || exportDto.Format != FormExportDto.FormatIdentifier)
        {
            throw new ArgumentException(
                $"Unsupported export format '{exportDto.Format}'. Expected '{FormExportDto.FormatIdentifier}'.",
                nameof(exportDto));
        }

        // Validate SchemaJson is non-empty and valid JSON.
        ValidateSchemaJson(exportDto.SchemaJson);

        // Ensure Description is not null for the new form.
        var description = string.IsNullOrEmpty(exportDto.Description) ? "Imported from export" : exportDto.Description;

        var form = new FormDefinition
        {
            FormCode = $"FORM-{Guid.NewGuid():N}",
            Title = exportDto.Title,
            Description = description,
            Tags = "imported",
            SchemaJSON = exportDto.SchemaJson,
            IsPublic = false,
            IsBiIntegrated = false,
            Status = "Draft",
            Version = 1,
            Revision = 0,
            CreatedByUserID = currentUserId,
            CreatedAt = DateTime.UtcNow
        };

        _context.Forms.Add(form);
        await _context.SaveChangesAsync();

        await LogActionAsync(form.FormID, currentUserId, "Import", $"Imported form '{form.Title}' from export format {exportDto.Format}.");
        _logger.LogInformation("Form imported: FormID={FormID}, Title={Title}", form.FormID, form.Title);
        return MapToDto(form);
    }

    /// <summary>
    /// Admin-only: toggles a form's status between "Active" and "Archived".
    /// Returns true when the status changed; returns false if the form does not exist.
    /// </summary>
    public async Task<bool> ToggleStatusAsync(int formId, int currentUserId)
    {
        var form = await _context.Forms.FindAsync(formId);
        if (form == null)
        {
            _logger.LogWarning("Form not found for status toggle: FormID={FormID}", formId);
            return false;
        }

        var previousStatus = form.Status;
        var newStatus = form.Status switch
        {
            "Active" => "Archived",
            "Archived" => "Active",
            _ => form.Status
        };

        if (newStatus == previousStatus)
        {
            return false;
        }

        form.Status = newStatus;
        await _context.SaveChangesAsync();

        await LogActionAsync(form.FormID, currentUserId, "ToggleStatus",
            $"Status changed from '{previousStatus}' to '{newStatus}'.");

        _logger.LogInformation("Form {FormID} status toggled: {Previous} -> {New}", form.FormID, previousStatus, newStatus);
        return true;
    }

    /// <summary>
    /// Admin-only: permanently deletes a form definition and all of its submissions.
    /// Returns true when the form was deleted; returns false if the form does not exist.
    /// </summary>
    public async Task<bool> DeleteFormAsync(int formId, int currentUserId)
    {
        var form = await _context.Forms.FindAsync(formId);
        if (form == null)
        {
            _logger.LogWarning("Form not found for deletion: FormID={FormID}", formId);
            return false;
        }

        // Optionally detach/soft-delete linked submissions; here we delete related submissions.
        var submissions = await _context.FormSubmissions
            .Where(s => s.FormID == formId)
            .ToListAsync();
        foreach (var sub in submissions)
        {
            var history = await _context.WorkflowHistory
                .Where(h => h.SubmissionID == sub.SubmissionID)
                .ToListAsync();
            _context.WorkflowHistory.RemoveRange(history);

            _context.FormSubmissions.Remove(sub);
        }

        _context.Forms.Remove(form);
        await _context.SaveChangesAsync();

        await LogActionAsync(formId, currentUserId, "Delete",
            $"Form '{form.Title}' (ID={form.FormID}, version {form.Version}) and all related submissions deleted.");

        _logger.LogInformation("Form deleted: FormID={FormID}, Title={Title}", formId, form.Title);
        return true;
    }

    /// <summary>
    /// Validates that the supplied schema string is non-empty and parses as valid JSON.
    /// </summary>
    private static void ValidateSchemaJson(string schemaJson)
    {
        if (string.IsNullOrWhiteSpace(schemaJson))
        {
            throw new ArgumentException("SchemaJson must not be empty or whitespace.", nameof(schemaJson));
        }

        try
        {
            using (JsonDocument.Parse(schemaJson))
            {
                // Parsing succeeded - schema is valid JSON.
            }
        }
        catch (JsonException ex)
        {
            throw new ArgumentException($"SchemaJson is not valid JSON: {ex.Message}", nameof(schemaJson));
        }
    }

    /// <summary>
    /// Generates a cryptographically random 10-character alphanumeric token for public forms.
    /// </summary>
    public static string GeneratePublicToken()
    {
        const string chars = "23456789abcdefghjkmnpqrstuvwxyz";
        var bytes = System.Security.Cryptography.RandomNumberGenerator.GetBytes(10);
        var result = new char[10];
        for (int i = 0; i < 10; i++)
        {
            result[i] = chars[bytes[i] % chars.Length];
        }
        return new string(result);
    }

    /// <summary>
    /// Maps a FormDefinition entity to a FormResponseDto.
    /// </summary>
    private static FormResponseDto MapToDto(FormDefinition form, DateTime? updatedAt = null)
    {
        return new FormResponseDto
        {
            FormID = form.FormID,
            FormCode = form.FormCode,
            Title = form.Title,
            Description = form.Description,
            SchemaJson = form.SchemaJSON,
            SettingsJson = form.Tags,
            Category = form.Category,
            Status = form.Status,
            Version = form.Version,
            Revision = form.Revision,
            CreatedByUserID = form.CreatedByUserID,
            CreatedByUserName = form.CreatedByUser != null ? (!string.IsNullOrWhiteSpace(form.CreatedByUser.DisplayName) ? form.CreatedByUser.DisplayName : form.CreatedByUser.Username) : null,
            CreatedAt = form.CreatedAt,
            UpdatedAt = updatedAt ?? form.CreatedAt,
            IsPublic = form.IsPublic,
            PublicToken = form.PublicToken
        };
    }

    /// <summary>
    /// Writes an audit log entry to dbo.AuditLogs.
    /// </summary>
    private async Task LogActionAsync(int formId, int userId, string action, string details)
    {
        var audit = new AuditLog
        {
            UserID = userId,
            Username = null,
            Action = action,
            EntityName = "Forms",
            EntityID = formId.ToString(),
            IPAddress = null,
            Timestamp = DateTime.UtcNow,
            Details = details
        };

        _context.AuditLogs.Add(audit);
        await _context.SaveChangesAsync();
    }
}