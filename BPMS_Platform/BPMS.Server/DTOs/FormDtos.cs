namespace BPMS.Server.DTOs;

using System.ComponentModel.DataAnnotations;

/// <summary>
/// DTO for creating a new form.
/// </summary>
public class CreateFormDto
{
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public string SchemaJson { get; set; } = string.Empty;

    [MaxLength(250)]
    public string? Category { get; set; }

    public string? SettingsJson { get; set; }

    public string? PublicToken { get; set; }
}

/// <summary>
/// DTO for updating an existing form.
/// </summary>
public class UpdateFormDto
{
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public string SchemaJson { get; set; } = string.Empty;

    public string? SettingsJson { get; set; }

    public string? PublicToken { get; set; }
}

/// <summary>
/// DTO for form read responses.
/// </summary>
public class FormResponseDto
{
    public int FormID { get; set; }
    public string FormCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SchemaJson { get; set; } = string.Empty;
    public string? SettingsJson { get; set; }
    public string? Category { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Version { get; set; }
    public int Revision { get; set; }
    public int CreatedByUserID { get; set; }
    public string? CreatedByUserName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public bool IsPublic { get; set; }
    public string? PublicToken { get; set; }

    // پرچم‌های دسترسی اختصاصی کاربر جاری
    public bool CanEditDesign { get; set; } = false;
    public bool CanViewReports { get; set; } = false;
    public bool CanShare { get; set; } = false;
    public bool CanDelete { get; set; } = false;
    public bool IsSharedWithMe { get; set; } = false;
}

/// <summary>
/// DTO representing a form share entry with a SuperUser.
/// </summary>
public class FormShareDto
{
    public int Id { get; set; }
    public string FormKey { get; set; } = string.Empty;
    public int? FormId { get; set; }
    public int SharedWithUserId { get; set; }
    public string SharedWithUsername { get; set; } = string.Empty;
    public string SharedWithDisplayName { get; set; } = string.Empty;
    public string? SharedWithEmail { get; set; }
    public bool CanEditDesign { get; set; }
    public bool CanViewReports { get; set; }
    public int SharedByUserId { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Request DTO for creating or updating a form share.
/// </summary>
public class UpsertFormShareRequestDto
{
    [Required]
    public int SharedWithUserId { get; set; }
    public bool CanEditDesign { get; set; } = false;
    public bool CanViewReports { get; set; } = false;
}

/// <summary>
/// Request DTO for transferring full form ownership to another SuperUser.
/// </summary>
public class TransferFormOwnershipRequestDto
{
    [Required]
    public int NewOwnerUserId { get; set; }
}

/// <summary>
/// DTO for exporting/importing a form as a portable JSON representation.
/// </summary>
public class FormExportDto
{
    /// <summary>
    /// Format identifier for this export format. All exports must carry this value.
    /// </summary>
    public const string FormatIdentifier = "BPMS_FORM_EXPORT_V1";

    /// <summary>
    /// Format identifier. Must equal <c>BPMS_FORM_EXPORT_V1</c> for this service.
    /// </summary>
    public string Format { get; set; } = FormatIdentifier;

    /// <summary>
    /// Form title.
    /// </summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Form description.
    /// </summary>
    public string? Description { get; set; }

    /// <summary>
    /// The form schema as a JSON string.
    /// </summary>
    public string SchemaJson { get; set; } = string.Empty;

    /// <summary>
    /// Optional settings as a JSON string.
    /// </summary>
    public string? SettingsJson { get; set; }

    /// <summary>
    /// Timestamp when the export was generated.
    /// </summary>
    public DateTime ExportedAt { get; set; }
}
