using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("UserGroupMembers", Schema = "dbo")]
public class UserGroupMember
{
    public int GroupID { get; set; }
    public int UserID { get; set; }
    [Column("JoinedAt")]
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(GroupID))]
    public UserGroup Group { get; set; } = null!;

    [ForeignKey(nameof(UserID))]
    public AppUser User { get; set; } = null!;
}