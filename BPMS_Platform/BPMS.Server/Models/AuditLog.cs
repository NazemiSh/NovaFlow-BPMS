using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

/// <summary>
/// Audit trail of user actions (mapped to dbo.AuditLogs).
/// </summary>
[Table("AuditLogs", Schema = "dbo")]
public class AuditLog
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long LogID { get; set; }

    public int? UserID { get; set; }

    [MaxLength(100)]
    public string? Username { get; set; }

    [Required]
    [MaxLength(100)]
    public string Action { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? EntityName { get; set; }

    [MaxLength(50)]
    public string? EntityID { get; set; }

    [MaxLength(50)]
    public string? IPAddress { get; set; }

    [MaxLength(250)]
    public string? UserAgent { get; set; }

    /// <summary>
    /// Free-form details payload (nvarchar(max) in SQL Server).
    /// </summary>
    public string? Details { get; set; }

    public DateTime Timestamp { get; set; }
}
