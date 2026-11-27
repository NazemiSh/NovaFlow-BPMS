using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

/// <summary>
/// Join entity between AppUser and AppRole (mapped to dbo.AppUserRoles).
/// Composite primary key: (UserID, RoleID).
/// </summary>
[Table("AppUserRoles", Schema = "dbo")]
public class AppUserRole
{
    public int UserID { get; set; }

    public int RoleID { get; set; }

    public DateTime AssignedAt { get; set; }

    [ForeignKey(nameof(UserID))]
    public AppUser User { get; set; } = null!;

    [ForeignKey(nameof(RoleID))]
    public AppRole Role { get; set; } = null!;
}
