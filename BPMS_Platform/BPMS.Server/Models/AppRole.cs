using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Models;

/// <summary>
/// Application role definition (mapped to dbo.AppRoles).
/// </summary>
[Table("AppRoles", Schema = "dbo")]
[Index(nameof(RoleName), IsUnique = true)]
public class AppRole
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int RoleID { get; set; }

    [Required]
    [MaxLength(50)]
    public string RoleName { get; set; } = string.Empty;

    [MaxLength(250)]
    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AppUserRole> UserRoles { get; set; } = new List<AppUserRole>();
}
