using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Models;

/// <summary>
/// Form definition / schema versioning (mapped to dbo.Forms).
/// </summary>
[Table("Forms", Schema = "dbo")]
[Index(nameof(FormCode), nameof(Version), nameof(Revision), IsUnique = true)]
public class FormDefinition
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int FormID { get; set; }

    [Required]
    [MaxLength(50)]
    public string FormCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    [MaxLength(250)]
    public string? Tags { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; } = "سازمانی";

    public int Version { get; set; } = 1;

    public int Revision { get; set; } = 0;

    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "Draft";

    public bool IsPublic { get; set; } = false;

    [MaxLength(32)]
    public string? PublicToken { get; set; }

    public bool IsBiIntegrated { get; set; } = false;

    [Required]
    public string SchemaJSON { get; set; } = string.Empty;

    public int CreatedByUserID { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? PublishedAt { get; set; }

    [ForeignKey(nameof(CreatedByUserID))]
    public AppUser CreatedByUser { get; set; } = null!;
}
