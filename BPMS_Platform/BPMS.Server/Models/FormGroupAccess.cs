using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("FormGroupAccess", Schema = "dbo")]
public class FormGroupAccess
{
    public int FormID { get; set; }
    public int GroupID { get; set; }
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(FormID))]
    public FormDefinition Form { get; set; } = null!;

    [ForeignKey(nameof(GroupID))]
    public UserGroup Group { get; set; } = null!;
}