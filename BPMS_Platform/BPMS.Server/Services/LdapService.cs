using System.DirectoryServices.Protocols;
using System.Net;
using BPMS.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace BPMS.Server.Services;

public class LdapService : ILdapService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _config;
    private readonly ILogger<LdapService> _logger;

    public LdapService(ApplicationDbContext context, IConfiguration config, ILogger<LdapService> logger)
    {
        _context = context;
        _config = config;
        _logger = logger;
    }

    public class EffectiveAdSettings
    {
        public bool IsEnabled { get; set; }
        public string Domain { get; set; } = string.Empty;
        public string Server { get; set; } = string.Empty;
        public int Port { get; set; } = 389;
        public string ServiceUser { get; set; } = string.Empty;
        public string ServicePassword { get; set; } = string.Empty;
    }

    private EffectiveAdSettings GetEffectiveSettings()
    {
        try
        {
            var items = _context.SystemSettings
                .AsNoTracking()
                .Where(s => s.SettingKey.StartsWith("AD:"))
                .ToDictionary(s => s.SettingKey, s => s.SettingValue);

            var isEnabledStr = items.GetValueOrDefault("AD:IsEnabled");
            bool isEnabled = isEnabledStr != null
                ? isEnabledStr.Equals("true", StringComparison.OrdinalIgnoreCase)
                : _config.GetValue<bool>("Ldap:Enabled");

            var domain = items.GetValueOrDefault("AD:DomainName") ?? _config["Ldap:Domain"] ?? string.Empty;
            var server = items.GetValueOrDefault("AD:LdapServer") ?? _config["Ldap:Server"] ?? string.Empty;
            var portStr = items.GetValueOrDefault("AD:LdapPort");
            int port = int.TryParse(portStr, out var p) ? p : (_config.GetValue<int?>("Ldap:Port") ?? 389);
            var serviceUser = items.GetValueOrDefault("AD:ServiceUser") ?? string.Empty;
            var servicePassword = items.GetValueOrDefault("AD:ServicePassword") ?? string.Empty;

            return new EffectiveAdSettings
            {
                IsEnabled = isEnabled,
                Domain = domain.Trim(),
                Server = server.Trim(),
                Port = port,
                ServiceUser = serviceUser.Trim(),
                ServicePassword = servicePassword
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load AD settings from DB, falling back to appsettings.json");
            return new EffectiveAdSettings
            {
                IsEnabled = _config.GetValue<bool>("Ldap:Enabled"),
                Domain = (_config["Ldap:Domain"] ?? string.Empty).Trim(),
                Server = (_config["Ldap:Server"] ?? string.Empty).Trim(),
                Port = _config.GetValue<int?>("Ldap:Port") ?? 389
            };
        }
    }

    private async Task<EffectiveAdSettings> GetEffectiveSettingsAsync()
    {
        try
        {
            var items = await _context.SystemSettings
                .AsNoTracking()
                .Where(s => s.SettingKey.StartsWith("AD:"))
                .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

            var isEnabledStr = items.GetValueOrDefault("AD:IsEnabled");
            bool isEnabled = isEnabledStr != null
                ? isEnabledStr.Equals("true", StringComparison.OrdinalIgnoreCase)
                : _config.GetValue<bool>("Ldap:Enabled");

            var domain = items.GetValueOrDefault("AD:DomainName") ?? _config["Ldap:Domain"] ?? string.Empty;
            var server = items.GetValueOrDefault("AD:LdapServer") ?? _config["Ldap:Server"] ?? string.Empty;
            var portStr = items.GetValueOrDefault("AD:LdapPort");
            int port = int.TryParse(portStr, out var p) ? p : (_config.GetValue<int?>("Ldap:Port") ?? 389);
            var serviceUser = items.GetValueOrDefault("AD:ServiceUser") ?? string.Empty;
            var servicePassword = items.GetValueOrDefault("AD:ServicePassword") ?? string.Empty;

            return new EffectiveAdSettings
            {
                IsEnabled = isEnabled,
                Domain = domain.Trim(),
                Server = server.Trim(),
                Port = port,
                ServiceUser = serviceUser.Trim(),
                ServicePassword = servicePassword
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load AD settings asynchronously from DB, falling back to appsettings.json");
            return new EffectiveAdSettings
            {
                IsEnabled = _config.GetValue<bool>("Ldap:Enabled"),
                Domain = (_config["Ldap:Domain"] ?? string.Empty).Trim(),
                Server = (_config["Ldap:Server"] ?? string.Empty).Trim(),
                Port = _config.GetValue<int?>("Ldap:Port") ?? 389
            };
        }
    }

    public bool IsLdapEnabled()
    {
        var settings = GetEffectiveSettings();
        return settings.IsEnabled;
    }

    public async Task<bool> IsLdapEnabledAsync()
    {
        var settings = await GetEffectiveSettingsAsync();
        return settings.IsEnabled;
    }

    public async Task<(bool Success, string DisplayName, string Email, string? ErrorMessage)> ValidateUserAsync(string username, string password)
    {
        var settings = await GetEffectiveSettingsAsync();

        if (!settings.IsEnabled)
        {
            return (false, username, string.Empty, "احراز هویت Active Directory در سامانه فعال نیست.");
        }

        if (string.IsNullOrWhiteSpace(settings.Domain) || string.IsNullOrWhiteSpace(settings.Server))
        {
            return (false, username, string.Empty, "تنظیمات آدرس سرور یا دامنه Active Directory در سامانه پیکربندی نشده است.");
        }

        try
        {
            var result = await Task.Run(() =>
            {
                var bindName = NormalizeBindName(username, settings.Domain);
                var identifier = new LdapDirectoryIdentifier(settings.Server, settings.Port);
                var credential = new NetworkCredential(bindName, password);

                using var connection = new LdapConnection(identifier, credential);
                connection.SessionOptions.ProtocolVersion = 3;
                connection.SessionOptions.SecureSocketLayer = settings.Port == 636;
                connection.SessionOptions.ReferralChasing = ReferralChasingOptions.None;
                connection.Timeout = TimeSpan.FromSeconds(10);

                connection.Bind();

                var cleanAccountName = username.Contains('@') ? username.Split('@')[0] : username;
                if (cleanAccountName.Contains('\\')) cleanAccountName = cleanAccountName.Split('\\')[1];

                var searchRequest = new SearchRequest(
                    $"DC={string.Join(",DC=", settings.Domain.Split('.'))}",
                    $"(&(objectClass=user)(|(sAMAccountName={EscapeFilter(cleanAccountName)})(userPrincipalName={EscapeFilter(username)})))",
                    SearchScope.Subtree,
                    new[] { "displayName", "mail" });

                var response = (SearchResponse)connection.SendRequest(searchRequest);
                var entries = response.Entries.Cast<SearchResultEntry>().ToList();

                string displayName = cleanAccountName;
                string mail = string.Empty;

                if (entries.Count > 0)
                {
                    var entry = entries[0];
                    var attrs = entry.Attributes;

                    if (attrs.Contains("displayName"))
                    {
                        var values = (string[])attrs["displayName"].GetValues(typeof(string));
                        if (values.Length > 0 && !string.IsNullOrWhiteSpace(values[0]))
                            displayName = values[0];
                    }

                    if (attrs.Contains("mail"))
                    {
                        var values = (string[])attrs["mail"].GetValues(typeof(string));
                        if (values.Length > 0 && values[0] is not null)
                            mail = values[0];
                    }
                }

                return (Success: true, DisplayName: displayName, Email: mail, ErrorMessage: (string?)null);
            });

            return result;
        }
        catch (LdapException ldapEx)
        {
            _logger.LogWarning(ldapEx, "LDAP bind failed for username: {Username}. ErrorCode={ErrorCode}", username, ldapEx.ErrorCode);
            if (ldapEx.ErrorCode == 49) // InvalidCredentials
            {
                return (false, username, string.Empty, "نام کاربری یا کلمه عبور در اکتیو دایرکتوری اشتباه است.");
            }
            return (false, username, string.Empty, $"خطای احراز هویت Active Directory (کد {ldapEx.ErrorCode}): {ldapEx.ServerErrorMessage ?? ldapEx.Message}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "LDAP connection/validation error for username: {Username}", username);
            return (false, username, string.Empty, $"عدم امکان اتصال به سرور Active Directory ({settings.Server}:{settings.Port}): {ex.Message}");
        }
    }

    public async Task<(bool Success, string Message, List<AdGroupInfoDto> Groups)> GetActiveDirectoryGroupsAsync(
        string? ldapServer,
        int ldapPort,
        string? domainName,
        string bindUsername,
        string bindPassword,
        string? searchFilter = null)
    {
        var settings = await GetEffectiveSettingsAsync();
        var effectiveServer = string.IsNullOrWhiteSpace(ldapServer) ? settings.Server : ldapServer.Trim();
        var effectivePort = ldapPort > 0 ? ldapPort : (settings.Port > 0 ? settings.Port : 389);
        var effectiveDomain = string.IsNullOrWhiteSpace(domainName) ? settings.Domain : domainName.Trim();

        if (string.IsNullOrWhiteSpace(effectiveServer) || string.IsNullOrWhiteSpace(effectiveDomain))
        {
            return (false, "تنظیمات سرور یا نام دامنه Active Directory کامل نیست.", new List<AdGroupInfoDto>());
        }

        try
        {
            var groups = await Task.Run(() =>
            {
                var result = new List<AdGroupInfoDto>();
                var bindName = NormalizeBindName(bindUsername, effectiveDomain);
                var identifier = new LdapDirectoryIdentifier(effectiveServer, effectivePort);
                var credential = new NetworkCredential(bindName, bindPassword);

                using var connection = new LdapConnection(identifier, credential);
                connection.SessionOptions.ProtocolVersion = 3;
                connection.SessionOptions.SecureSocketLayer = effectivePort == 636;
                connection.SessionOptions.ReferralChasing = ReferralChasingOptions.None;
                connection.Timeout = TimeSpan.FromSeconds(15);
                connection.Bind();

                var baseDn = $"DC={string.Join(",DC=", effectiveDomain.Split('.'))}";
                var filterPart = string.IsNullOrWhiteSpace(searchFilter)
                    ? "(cn=*)"
                    : $"(cn=*{EscapeFilter(searchFilter.Trim())}*)";

                var groupSearch = new SearchRequest(
                    baseDn,
                    $"(&(objectCategory=group){filterPart})",
                    SearchScope.Subtree,
                    new[] { "cn", "description", "distinguishedName" })
                {
                    SizeLimit = 200
                };

                var groupResponse = (SearchResponse)connection.SendRequest(groupSearch);

                foreach (SearchResultEntry gEntry in groupResponse.Entries)
                {
                    var gAttrs = gEntry.Attributes;
                    var cn = GetSingleAttribute(gAttrs, "cn");
                    if (string.IsNullOrWhiteSpace(cn)) continue;

                    var dn = gEntry.DistinguishedName;
                    var desc = GetSingleAttribute(gAttrs, "description");

                    var groupDto = new AdGroupInfoDto
                    {
                        GroupName = cn,
                        DistinguishedName = dn,
                        Description = desc
                    };

                    // واکشی اعضای این گروه از اکتیو دایرکتوری
                    var memberSearch = new SearchRequest(
                        baseDn,
                        $"(&(objectCategory=person)(objectClass=user)(memberOf={EscapeFilter(dn)}))",
                        SearchScope.Subtree,
                        new[] { "sAMAccountName", "displayName", "mail" })
                    {
                        SizeLimit = 500
                    };

                    var memberResponse = (SearchResponse)connection.SendRequest(memberSearch);
                    foreach (SearchResultEntry mEntry in memberResponse.Entries)
                    {
                        var mAttrs = mEntry.Attributes;
                        var sam = GetSingleAttribute(mAttrs, "sAMAccountName");
                        if (string.IsNullOrWhiteSpace(sam)) continue;

                        var disp = GetSingleAttribute(mAttrs, "displayName");
                        var mail = GetSingleAttribute(mAttrs, "mail");

                        groupDto.Members.Add(new AdGroupMemberInfoDto
                        {
                            Username = sam,
                            DisplayName = string.IsNullOrWhiteSpace(disp) ? sam : disp,
                            Email = mail ?? string.Empty
                        });
                    }

                    result.Add(groupDto);
                }

                return result.OrderBy(g => g.GroupName).ToList();
            });

            return (true, $"{groups.Count} گروه از Active Directory بازیابی شد.", groups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching AD groups from {Server}", effectiveServer);
            return (false, "خطا در ارتباط با Active Directory: " + ex.Message, new List<AdGroupInfoDto>());
        }
    }

    private static string? GetSingleAttribute(SearchResultAttributeCollection attrs, string name)
    {
        if (!attrs.Contains(name)) return null;
        var values = (string[])attrs[name].GetValues(typeof(string));
        return values.Length > 0 ? values[0] : null;
    }

    private static string NormalizeBindName(string username, string domain)
    {
        if (username.Contains('@', StringComparison.OrdinalIgnoreCase))
            return username;
        if (username.Contains('\\'))
            return username;
        return $"{username}@{domain}";
    }

    private static string EscapeFilter(string value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var result = new System.Text.StringBuilder(value.Length + 3);
        foreach (var c in value)
        {
            switch (c)
            {
                case '\\': result.Append("\\5c"); break;
                case '(': result.Append("\\28"); break;
                case ')': result.Append("\\29"); break;
                case '*': result.Append("\\2a"); break;
                case '\0': result.Append("\\00"); break;
                default: result.Append(c); break;
            }
        }
        return result.ToString();
    }
}
