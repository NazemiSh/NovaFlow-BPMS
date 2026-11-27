using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Models;

/// <summary>
/// Application user (mapped to dbo.AppUsers).
/// Supports both local accounts and Active Directory users.
/// </summary>
[Table("AppUsers", Schema = "dbo")]
[Index(nameof(Username), IsUnique = true)]
public class AppUser
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int UserID { get; set; }

    [Required]
    [MaxLength(100)]
    public string Username { get; set; } = string.Empty;

    [MaxLength(255)]
    public string? PasswordHash { get; set; }

    [Required]
    [MaxLength(150)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    /// <summary>
    /// True when the account is authenticated against Active Directory.
    /// </summary>
    public bool IsActiveDirectoryUser { get; set; } = false;

    public bool IsActive { get; set; } = true;

    public int AccessFailedCount { get; set; } = 0;

    public DateTime? LockoutEnd { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastLoginAt { get; set; }

    public ICollection<AppUserRole> UserRoles { get; set; } = new List<AppUserRole>();
}
