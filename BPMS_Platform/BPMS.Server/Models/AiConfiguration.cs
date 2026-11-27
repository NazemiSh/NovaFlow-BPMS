using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BPMS.Server.Models;

[Table("AiConfigurations", Schema = "dbo")]
public class AiConfiguration
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int ConfigID { get; set; }

    [Required]
    [MaxLength(100)]
    public string Provider { get; set; } = "OpenAI-Compatible";

    [Required]
    [MaxLength(255)]
    public string BaseUrl { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? ApiKey { get; set; }

    [Required]
    [MaxLength(100)]
    public string ModelName { get; set; } = "gpt-4o-mini";

    public double Temperature { get; set; } = 0.2;
    public int MaxTokens { get; set; } = 2000;
    public bool IsEnabled { get; set; } = true;
    public string? SystemPrompt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public int? UpdatedByUserID { get; set; }
}
