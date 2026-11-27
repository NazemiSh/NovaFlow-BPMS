namespace BPMS.Server.Models.Dtos;

public class LoginRequestDto
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponseDto
{
    public string Token { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public IEnumerable<string> Roles { get; set; } = [];
    public DateTime ExpiresAt { get; set; }
}

public class AdSettingsDto
{
    public string DomainName { get; set; } = string.Empty;
    public string LdapServer { get; set; } = string.Empty;
    public int LdapPort { get; set; } = 389;
    public string ServiceUser { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = false;
}