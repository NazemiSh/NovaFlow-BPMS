namespace BPMS.Server.Controllers;

using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

public class CreateGroupDto
{
    public string GroupName { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class AddGroupMemberDto
{
    public int UserId { get; set; }
}

public class FormAccessDto
{
    public List<int> GroupIds { get; set; } = new();
}

public class AdGroupSyncRequestDto
{
    public string ServiceUser { get; set; } = string.Empty;
    public string ServicePassword { get; set; } = string.Empty;
    public string? Filter { get; set; }
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILdapService _ldapService;

    public GroupsController(ApplicationDbContext context, ILdapService ldapService)
    {
        _context = context;
        _ldapService = ldapService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var groups = await _context.UserGroups
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .Select(g => new
            {
                g.GroupID,
                g.GroupName,
                g.Description,
                g.CreatedAt,
                Members = g.Members.Select(m => new
                {
                    m.UserID,
                    Username = m.User.Username,
                    DisplayName = m.User.DisplayName,
                    Email = m.User.Email
                }).ToList()
            })
            .ToListAsync();

        return Ok(groups);
    }

    [HttpPost("ad-preview")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> PreviewAdGroups([FromBody] AdGroupSyncRequestDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.ServiceUser) || string.IsNullOrWhiteSpace(dto.ServicePassword))
            return BadRequest(new { message = "نام کاربری و کلمه عبور دامین الزامی است." });

        var adItems = await _context.SystemSettings
            .Where(s => s.SettingKey.StartsWith("AD:"))
            .ToDictionaryAsync(s => s.SettingKey, s => s.SettingValue);

        var server = adItems.TryGetValue("AD:LdapServer", out var srv) ? srv : null;
        var domain = adItems.TryGetValue("AD:DomainName", out var dom) ? dom : null;
        var port = adItems.TryGetValue("AD:LdapPort", out var prt) && int.TryParse(prt, out var p) ? p : 389;

        var (success, message, groups) = await _ldapService.GetActiveDirectoryGroupsAsync(
            server, port, domain, dto.ServiceUser.Trim(), dto.ServicePassword, dto.Filter);

        if (!success)
            return BadRequest(new { message });

        return Ok(new { message, groups });
    }

    [HttpPost("ad-import")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ImportAdGroups([FromBody] List<AdGroupInfoDto> selectedGroups)
    {
        if (selectedGroups == null || selectedGroups.Count == 0)
            return BadRequest(new { message = "هیچ گروهی انتخاب نشده است." });

        var userRole = await _context.AppRoles.FirstOrDefaultAsync(r => r.RoleName == "User")
                       ?? await _context.AppRoles.FirstOrDefaultAsync(r => r.RoleName == "Operator");

        if (userRole == null)
        {
            userRole = new AppRole
            {
                RoleName = "User",
                Description = "Standard user role",
                CreatedAt = DateTime.UtcNow
            };
            _context.AppRoles.Add(userRole);
            await _context.SaveChangesAsync();
        }

        int importedGroupsCount = 0;
        int syncedMembersCount = 0;

        foreach (var adGroup in selectedGroups)
        {
            if (string.IsNullOrWhiteSpace(adGroup.GroupName)) continue;
            var gName = adGroup.GroupName.Trim();

            var dbGroup = await _context.UserGroups
                .Include(g => g.Members)
                .FirstOrDefaultAsync(g => g.GroupName == gName);

            if (dbGroup == null)
            {
                dbGroup = new UserGroup
                {
                    GroupName = gName,
                    Description = string.IsNullOrWhiteSpace(adGroup.Description)
                        ? "گروه همگام‌سازی‌شده از Active Directory"
                        : adGroup.Description.Trim(),
                    CreatedAt = DateTime.UtcNow
                };
                _context.UserGroups.Add(dbGroup);
                await _context.SaveChangesAsync();
                importedGroupsCount++;
            }

            foreach (var member in adGroup.Members)
            {
                if (string.IsNullOrWhiteSpace(member.Username)) continue;
                var uname = member.Username.Trim();

                var dbUser = await _context.AppUsers.FirstOrDefaultAsync(u => u.Username == uname);
                if (dbUser == null)
                {
                    dbUser = new AppUser
                    {
                        Username = uname,
                        DisplayName = string.IsNullOrWhiteSpace(member.DisplayName) ? uname : member.DisplayName.Trim(),
                        Email = string.IsNullOrWhiteSpace(member.Email) ? null : member.Email.Trim(),
                        IsActiveDirectoryUser = true,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.AppUsers.Add(dbUser);
                    await _context.SaveChangesAsync();

                    _context.AppUserRoles.Add(new AppUserRole
                    {
                        UserID = dbUser.UserID,
                        RoleID = userRole.RoleID,
                        AssignedAt = DateTime.UtcNow
                    });
                    await _context.SaveChangesAsync();
                }

                var alreadyMember = await _context.UserGroupMembers
                    .AnyAsync(m => m.GroupID == dbGroup.GroupID && m.UserID == dbUser.UserID);

                if (!alreadyMember)
                {
                    _context.UserGroupMembers.Add(new UserGroupMember
                    {
                        GroupID = dbGroup.GroupID,
                        UserID = dbUser.UserID
                    });
                    syncedMembersCount++;
                }
            }

            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            message = $"✅ همگام‌سازی انجام شد: {selectedGroups.Count} گروه پردازش شد ({importedGroupsCount} گروه جدید) و {syncedMembersCount} عضو به گروه‌ها اضافه شدند."
        });
    }

    [HttpPost]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Create([FromBody] CreateGroupDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.GroupName))
            return BadRequest(new { message = "نام گروه الزامی است." });

        var group = new UserGroup
        {
            GroupName = dto.GroupName.Trim(),
            Description = dto.Description?.Trim(),
            CreatedAt = DateTime.UtcNow
        };
        _context.UserGroups.Add(group);
        await _context.SaveChangesAsync();
        return Ok(group);
    }

    [HttpDelete("{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int id)
    {
        var group = await _context.UserGroups.FindAsync(id);
        if (group == null) return NotFound(new { message = "گروه یافت نشد." });

        var activeSubmissions = await _context.FormSubmissions
            .Include(s => s.Form)
            .Where(s => s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed")
            .ToListAsync();

        int groupPendingTasks = 0;
        foreach (var s in activeSubmissions)
        {
            try
            {
                using var doc = JsonDocument.Parse(s.Form.SchemaJSON);
                if (doc.RootElement.TryGetProperty("workflowPolicy", out var wp) &&
                    wp.TryGetProperty("steps", out var steps))
                {
                    foreach (var step in steps.EnumerateArray())
                    {
                        var stepIdx = step.GetProperty("stepIndex").GetInt32();
                        if (s.WorkflowStatus.StartsWith($"PendingStep_{stepIdx}"))
                        {
                            if (step.TryGetProperty("approvers", out var approvers))
                            {
                                foreach (var app in approvers.EnumerateArray())
                                {
                                    if (app.TryGetProperty("type", out var t) && t.GetString() == "Group" &&
                                        app.TryGetProperty("id", out var gid) && gid.GetInt32() == id)
                                    {
                                        groupPendingTasks++;
                                    }
                                }
                            }
                            else if (step.TryGetProperty("approverType", out var at) && at.GetString() == "Group" &&
                                     step.TryGetProperty("approverId", out var aid) && aid.GetInt32() == id)
                            {
                                groupPendingTasks++;
                            }
                        }
                    }
                }
            }
            catch {}
        }

        if (groupPendingTasks > 0)
        {
            return BadRequest(new { message = $"امکان حذف گروه وجود ندارد ({groupPendingTasks} وظیفه در جریان در کارتابل منتظر اقدام این گروه است)." });
        }

        var members = await _context.UserGroupMembers.Where(m => m.GroupID == id).ToListAsync();
        _context.UserGroupMembers.RemoveRange(members);

        var accesses = await _context.FormGroupAccesses.Where(a => a.GroupID == id).ToListAsync();
        _context.FormGroupAccesses.RemoveRange(accesses);

        _context.UserGroups.Remove(group);
        await _context.SaveChangesAsync();

        return Ok(new { message = "گروه سازمانی با موفقیت حذف شد." });
    }

    [HttpPost("{id}/members")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddMember(int id, [FromBody] AddGroupMemberDto dto)
    {
        var group = await _context.UserGroups.FindAsync(id);
        if (group == null) return NotFound(new { message = "گروه یافت نشد." });

        var user = await _context.AppUsers.FindAsync(dto.UserId);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        var exists = await _context.UserGroupMembers.AnyAsync(m => m.GroupID == id && m.UserID == dto.UserId);
        if (!exists)
        {
            _context.UserGroupMembers.Add(new UserGroupMember { GroupID = id, UserID = dto.UserId });
            await _context.SaveChangesAsync();
        }
        return Ok(new { message = "کاربر با موفقیت به گروه افزوده شد." });
    }

    [HttpDelete("{id}/members/{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RemoveMember(int id, int userId)
    {
        var member = await _context.UserGroupMembers.FirstOrDefaultAsync(m => m.GroupID == id && m.UserID == userId);
        if (member != null)
        {
            _context.UserGroupMembers.Remove(member);
            await _context.SaveChangesAsync();
        }
        return Ok(new { message = "کاربر از گروه حذف شد." });
    }

    [HttpGet("forms/{formId}/access")]
    public async Task<IActionResult> GetFormAccess(int formId)
    {
        var groupIds = await _context.FormGroupAccesses
            .Where(a => a.FormID == formId)
            .Select(a => a.GroupID)
            .ToListAsync();
        return Ok(groupIds);
    }

    [HttpPost("forms/{formId}/access")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> SetFormAccess(int formId, [FromBody] FormAccessDto dto)
    {
        var existing = await _context.FormGroupAccesses.Where(a => a.FormID == formId).ToListAsync();
        _context.FormGroupAccesses.RemoveRange(existing);

        if (dto.GroupIds != null)
        {
            foreach (var gid in dto.GroupIds)
            {
                _context.FormGroupAccesses.Add(new FormGroupAccess { FormID = formId, GroupID = gid });
            }
        }
        await _context.SaveChangesAsync();
        return Ok(new { message = "سطوح دسترسی فرم به‌روزرسانی شد." });
    }
}