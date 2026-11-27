using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

/// <summary>
/// Workflow state-transition history for submissions (mapped to dbo.WorkflowHistory).
/// </summary>
[Table("WorkflowHistory", Schema = "dbo")]
public class WorkflowHistory
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long HistoryID { get; set; }

    public long SubmissionID { get; set; }

    [Required]
    [MaxLength(50)]
    public string ActionTaken { get; set; } = string.Empty;

    public int ActionByUserID { get; set; }

    public DateTime ActionAt { get; set; }

    [MaxLength(1000)]
    public string? Comments { get; set; }

    [MaxLength(250)]
    public string? PreviousStatus { get; set; }

    [Required]
    [MaxLength(250)]
    public string NewStatus { get; set; } = string.Empty;

    [ForeignKey(nameof(SubmissionID))]
    public FormSubmission Submission { get; set; } = null!;

    [ForeignKey(nameof(ActionByUserID))]
    public AppUser ActionByUser { get; set; } = null!;
}
