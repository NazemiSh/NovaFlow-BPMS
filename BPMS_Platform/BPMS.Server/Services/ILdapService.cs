namespace BPMS.Server.Services;

public class AdGroupMemberInfoDto
{
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
}

public class AdGroupInfoDto
{
    public string GroupName { get; set; } = string.Empty;
    public string DistinguishedName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<AdGroupMemberInfoDto> Members { get; set; } = new();
}

public interface ILdapService
{
    bool IsLdapEnabled();
    Task<bool> IsLdapEnabledAsync();
    Task<(bool Success, string DisplayName, string Email, string? ErrorMessage)> ValidateUserAsync(string username, string password);
    Task<(bool Success, string Message, List<AdGroupInfoDto> Groups)> GetActiveDirectoryGroupsAsync(
        string? ldapServer,
        int ldapPort,
        string? domainName,
        string bindUsername,
        string bindPassword,
        string? searchFilter = null);
}
