namespace BPMS.Server.DTOs;

public class CreateGroupDto
{
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<int>? MemberUserIds { get; set; }
}

public class GroupResponseDto
{
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int MembersCount { get; set; }
    public List<int> MemberUserIds { get; set; } = new();
}

public class SetFormAccessDto
{
    public List<int> GroupIds { get; set; } = new();
}

public class AiConfigDto
{
    public string Provider { get; set; } = "OpenAI-Compatible";
    public string BaseUrl { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
    public string ModelName { get; set; } = "gpt-4o-mini";
    public double Temperature { get; set; } = 0.2;
    public int MaxTokens { get; set; } = 2000;
    public bool IsEnabled { get; set; } = true;
    public string? SystemPrompt { get; set; }
}