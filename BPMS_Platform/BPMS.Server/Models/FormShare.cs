using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

/// <summary>
/// Sharing of a submission with another user (mapped to dbo.FormShares).
/// </summary>
[Table("FormShares", Schema = "dbo")]
public class FormShare
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long ShareID { get; set; }

    public long SubmissionID { get; set; }

    public int SharedWithUserID { get; set; }

    public int SharedByUserID { get; set; }

    public DateTime SharedAt { get; set; }

    public bool IsRead { get; set; } = false;

    [ForeignKey(nameof(SubmissionID))]
    public FormSubmission Submission { get; set; } = null!;

    [ForeignKey(nameof(SharedWithUserID))]
    public AppUser SharedWithUser { get; set; } = null!;

    [ForeignKey(nameof(SharedByUserID))]
    public AppUser SharedByUser { get; set; } = null!;
}
