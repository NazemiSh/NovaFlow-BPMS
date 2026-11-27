using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("MasterDataConnections", Schema = "dbo")]
public class MasterDataConnection
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(250)]
    public string ServerAddress { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string DatabaseName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string AuthType { get; set; } = "Sql"; // "Sql" or "Windows"

    [MaxLength(150)]
    public string? Username { get; set; }

    public string? EncryptedPassword { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public virtual ICollection<MasterDataTable> Tables { get; set; } = new List<MasterDataTable>();
}
