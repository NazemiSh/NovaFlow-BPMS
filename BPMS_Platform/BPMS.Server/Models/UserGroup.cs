using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Models;

[Table("UserGroups", Schema = "dbo")]
[Index(nameof(GroupName), IsUnique = true)]
public class UserGroup
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int GroupID { get; set; }

    [Required]
    [MaxLength(100)]
    public string GroupName { get; set; } = string.Empty;

    [MaxLength(250)]
    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<UserGroupMember> Members { get; set; } = new List<UserGroupMember>();
    public ICollection<FormGroupAccess> FormAccesses { get; set; } = new List<FormGroupAccess>();
}