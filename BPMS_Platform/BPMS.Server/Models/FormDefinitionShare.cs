using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

/// <summary>
/// اشتراک‌گذاری فرم و نگارش‌های آن بین کاربران ارشد سازمانی (mapped to dbo.FormDefinitionShares).
/// </summary>
[Table("FormDefinitionShares", Schema = "dbo")]
public class FormDefinitionShare
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [MaxLength(100)]
    public string FormKey { get; set; } = string.Empty;

    public int? FormId { get; set; }

    public int SharedWithUserId { get; set; }

    public bool CanEditDesign { get; set; } = false;

    public bool CanViewReports { get; set; } = false;

    public int SharedByUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(SharedWithUserId))]
    public AppUser SharedWithUser { get; set; } = null!;

    [ForeignKey(nameof(SharedByUserId))]
    public AppUser SharedByUser { get; set; } = null!;
}
