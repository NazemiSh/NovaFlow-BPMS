using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("MasterDataRecords", Schema = "dbo")]
public class MasterDataRecord
{
    [Key]
    public long Id { get; set; }

    [Required]
    public int TableId { get; set; }

    [Required]
    [MaxLength(250)]
    public string UniqueKeyValue { get; set; } = string.Empty;

    [Required]
    public string RowDataJson { get; set; } = "{}";

    public bool IsActive { get; set; } = true;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(TableId))]
    public virtual MasterDataTable? Table { get; set; }
}
