using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Models;

/// <summary>
/// A submitted instance of a form (mapped to dbo.FormSubmissions).
/// </summary>
[Table("FormSubmissions", Schema = "dbo")]
[Index(nameof(TrackingCode), IsUnique = true)]
public class FormSubmission
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long SubmissionID { get; set; }

    public int FormID { get; set; }

    [Required]
    [MaxLength(50)]
    public string TrackingCode { get; set; } = string.Empty;

    [Required]
    public string DataJSON { get; set; } = string.Empty;

    [Required]
    [MaxLength(250)]
    public string WorkflowStatus { get; set; } = "Submitted";

    public int? CurrentHandlerUserID { get; set; }

    public int CurrentStepIndex { get; set; } = 0;

    public int? SubmittedByUserID { get; set; }

    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    public DateTime? CompletedAt { get; set; }

    [MaxLength(64)]
    public string? DataHash { get; set; }

    public bool IsLocked { get; set; } = false;

    [ForeignKey(nameof(FormID))]
    public FormDefinition Form { get; set; } = null!;

    [ForeignKey(nameof(CurrentHandlerUserID))]
    public AppUser? CurrentHandlerUser { get; set; }

    [ForeignKey(nameof(SubmittedByUserID))]
    public AppUser? SubmittedByUser { get; set; }
}
