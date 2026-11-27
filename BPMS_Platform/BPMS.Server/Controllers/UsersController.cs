using BPMS.Server.Data;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Controllers;

public class CreateLocalUserDto
{
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "User";
}

public class ResetPasswordDto
{
    public string NewPassword { get; set; } = string.Empty;
}

public class DeactivateUserDto
{
    public int? TransferTasksToUserId { get; set; }
    public int? TransferFormsToUserId { get; set; }
}

public class OffboardingSummaryDto
{
    public int UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int PendingTasksCount { get; set; }
    public int OwnedFormsCount { get; set; }
    public List<string> OwnedFormTitles { get; set; } = new();
}

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly PasswordHasher _passwordHasher;
    private readonly ILicenseService _licenseService;
    private readonly ISecurityPolicyService _securityPolicyService;

    public UsersController(
        ApplicationDbContext context,
        PasswordHasher passwordHasher,
        ILicenseService licenseService,
        ISecurityPolicyService securityPolicyService)
    {
        _context = context;
        _passwordHasher = passwordHasher;
        _licenseService = licenseService;
        _securityPolicyService = securityPolicyService;
    }

    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _context.AppUsers
            .Include(u => u.UserRoles)
            .ThenInclude(ur => ur.Role)
            .Select(u => new
            {
                u.UserID,
                u.Username,
                u.DisplayName,
                u.Email,
                u.IsActive,
                IsActiveDirectoryUser = u.IsActiveDirectoryUser,
                IsLocked = u.LockoutEnd.HasValue && u.LockoutEnd.Value > DateTime.UtcNow,
                LockoutEnd = u.LockoutEnd,
                AccessFailedCount = u.AccessFailedCount,
                Roles = u.UserRoles.Select(r => r.Role.RoleName).ToList()
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpGet("directory")]
    [Authorize(Roles = "Admin,SuperUser")]
    public async Task<IActionResult> GetUsersDirectory()
    {
        var users = await _context.AppUsers
            .Where(u => u.IsActive)
            .OrderBy(u => u.DisplayName ?? u.Username)
            .Select(u => new
            {
                userID = u.UserID,
                username = u.Username,
                displayName = u.DisplayName,
                email = u.Email,
                isActive = u.IsActive
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpPost("local")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateLocalUser([FromBody] CreateLocalUserDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.DisplayName) || string.IsNullOrWhiteSpace(dto.Password))
        {
            return BadRequest(new { message = "کد/نام کاربری، نام و نام خانوادگی و کلمه عبور الزامی هستند." });
        }

        var passwordValidation = await _securityPolicyService.ValidatePasswordAsync(dto.Password);
        if (!passwordValidation.IsValid)
        {
            return BadRequest(new { message = passwordValidation.ErrorMessage, errors = passwordValidation.Errors });
        }

        // بررسی سقف مجاز کاربران در لایسنس سامانه
        var licenseStatus = await _licenseService.GetLicenseStatusAsync();
        var currentActiveUsers = await _context.AppUsers.CountAsync(u => u.IsActive);
        if (currentActiveUsers >= licenseStatus.MaxUsers)
        {
            return BadRequest(new
            {
                message = $"سقف مجاز کاربران در لایسنس سامانه ({licenseStatus.MaxUsers} کاربر فعال) تکمیل شده است. تعداد کاربران فعال فعلی: {currentActiveUsers}. جهت افزایش ظرفیت لایسنس با واحد پشتیبانی تماس حاصل فرمایید."
            });
        }

        var trimmedUsername = dto.Username.Trim();
        if (await _context.AppUsers.AnyAsync(u => u.Username == trimmedUsername))
        {
            return BadRequest(new { message = "کاربری با این نام کاربری قبلاً در سامانه ثبت شده است." });
        }

        var roleName = string.IsNullOrWhiteSpace(dto.Role) ? "User" : dto.Role.Trim();
        var role = await _context.AppRoles.FirstOrDefaultAsync(r => r.RoleName == roleName);
        if (role == null)
        {
            role = new AppRole
            {
                RoleName = roleName,
                Description = $"{roleName} role",
                CreatedAt = DateTime.UtcNow
            };
            _context.AppRoles.Add(role);
            await _context.SaveChangesAsync();
        }

        var user = new AppUser
        {
            Username = trimmedUsername,
            DisplayName = dto.DisplayName.Trim(),
            Email = string.IsNullOrWhiteSpace(dto.Email) ? null : dto.Email.Trim(),
            PasswordHash = _passwordHasher.HashPassword(dto.Password),
            IsActiveDirectoryUser = false,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _context.AppUsers.Add(user);
        await _context.SaveChangesAsync();

        _context.AppUserRoles.Add(new AppUserRole
        {
            UserID = user.UserID,
            RoleID = role.RoleID,
            AssignedAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();

        return Ok(new { message = "کاربر محلی با موفقیت ثبت شد.", userId = user.UserID });
    }

    [HttpPost("{userId}/reset-password")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ResetPassword(int userId, [FromBody] ResetPasswordDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.NewPassword))
        {
            return BadRequest(new { message = "کلمه عبور جدید نمی‌تواند خالی باشد." });
        }

        var user = await _context.AppUsers.FindAsync(userId);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        if (user.IsActiveDirectoryUser)
        {
            return BadRequest(new { message = "امکان تغییر کلمه عبور کاربران اکتیو دایرکتوری در سامانه وجود ندارد و باید از طریق شبکه دامنه تغییر کند." });
        }

        var passwordValidation = await _securityPolicyService.ValidatePasswordAsync(dto.NewPassword);
        if (!passwordValidation.IsValid)
        {
            return BadRequest(new { message = passwordValidation.ErrorMessage, errors = passwordValidation.Errors });
        }

        user.PasswordHash = _passwordHasher.HashPassword(dto.NewPassword);
        await _context.SaveChangesAsync();

        return Ok(new { message = $"کلمه عبور کاربر «{user.DisplayName}» با موفقیت تغییر یافت." });
    }

    [HttpGet("{id}/offboarding-summary")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetOffboardingSummary(int id)
    {
        var user = await _context.AppUsers.FindAsync(id);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        var pendingTasksCount = await _context.FormSubmissions
            .CountAsync(s => s.CurrentHandlerUserID == id && s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed");

        var ownedForms = await _context.Forms
            .Where(f => f.CreatedByUserID == id)
            .GroupBy(f => f.FormCode)
            .Select(g => g.OrderByDescending(x => x.Version).ThenByDescending(x => x.Revision).First().Title)
            .Distinct()
            .ToListAsync();

        return Ok(new OffboardingSummaryDto
        {
            UserId = user.UserID,
            Username = user.Username,
            DisplayName = user.DisplayName ?? user.Username,
            PendingTasksCount = pendingTasksCount,
            OwnedFormsCount = ownedForms.Count,
            OwnedFormTitles = ownedForms
        });
    }

    [HttpPost("{userId}/toggle-active")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ToggleActive(int userId, [FromBody] DeactivateUserDto? dto = null)
    {
        var user = await _context.AppUsers.FindAsync(userId);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        if (user.Username.Equals("local_admin", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "امکان غیرفعال‌سازی کاربر ادمین اصلی سیستم وجود ندارد." });
        }

        if (!user.IsActive)
        {
            // بررسی سقف مجاز لایسنس در هنگام فعال‌سازی مجدد کاربر
            var licenseStatus = await _licenseService.GetLicenseStatusAsync();
            var currentActiveUsers = await _context.AppUsers.CountAsync(u => u.IsActive);
            if (currentActiveUsers >= licenseStatus.MaxUsers)
            {
                return BadRequest(new
                {
                    message = $"سقف مجاز کاربران در لایسنس سامانه ({licenseStatus.MaxUsers} کاربر فعال) تکمیل شده است. تعداد کاربران فعال فعلی: {currentActiveUsers}. امکان فعال‌سازی مجدد این کاربر وجود ندارد."
                });
            }

            user.IsActive = true;
            await _context.SaveChangesAsync();
            return Ok(new { message = $"وضعیت حساب کاربری «{user.DisplayName}» به فعال تغییر یافت.", isActive = true });
        }

        // غیرفعال‌سازی کاربر فعال (Offboarding)
        var pendingTasks = await _context.FormSubmissions
            .Where(s => s.CurrentHandlerUserID == userId && s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed")
            .ToListAsync();

        var ownedForms = await _context.Forms
            .Where(f => f.CreatedByUserID == userId)
            .ToListAsync();

        int pendingCount = pendingTasks.Count;
        int ownedFormsCount = ownedForms.Select(f => f.FormCode).Distinct().Count();

        if (pendingCount > 0 && (!dto?.TransferTasksToUserId.HasValue ?? true))
        {
            return BadRequest(new
            {
                requiresOffboarding = true,
                pendingTasksCount = pendingCount,
                ownedFormsCount = ownedFormsCount,
                message = $"این کاربر دارای {pendingCount} وظیفه باز در کارتابل است. لطفاً کاربر جایگزین برای انتقال وظایف را مشخص فرمایید."
            });
        }

        if (ownedFormsCount > 0 && (!dto?.TransferFormsToUserId.HasValue ?? true))
        {
            return BadRequest(new
            {
                requiresOffboarding = true,
                pendingTasksCount = pendingCount,
                ownedFormsCount = ownedFormsCount,
                message = $"این کاربر طراح {ownedFormsCount} فرم سازمانی است. لطفاً کاربر ارشد جایگزین برای انتقال مالکیت فرم‌ها را مشخص فرمایید."
            });
        }

        AppUser? targetTaskUser = null;
        if (dto?.TransferTasksToUserId.HasValue == true && pendingCount > 0)
        {
            int targetTaskId = dto.TransferTasksToUserId.Value;
            if (targetTaskId == userId)
            {
                return BadRequest(new { message = "کاربر جایگزین کارتابل نمی‌تواند خود کاربر غیرفعال‌شونده باشد." });
            }
            targetTaskUser = await _context.AppUsers.FirstOrDefaultAsync(u => u.UserID == targetTaskId && u.IsActive);
            if (targetTaskUser == null)
            {
                return BadRequest(new { message = "کاربر جایگزین کارتابل یافت نشد یا حساب وی غیرفعال است." });
            }
        }

        AppUser? targetFormUser = null;
        if (dto?.TransferFormsToUserId.HasValue == true && ownedForms.Count > 0)
        {
            int targetFormId = dto.TransferFormsToUserId.Value;
            if (targetFormId == userId)
            {
                return BadRequest(new { message = "کاربر ارشد جایگزین مالکیت فرم‌ها نمی‌تواند خود کاربر غیرفعال‌شونده باشد." });
            }
            targetFormUser = await _context.AppUsers
                .Include(u => u.UserRoles).ThenInclude(ur => ur.Role)
                .FirstOrDefaultAsync(u => u.UserID == targetFormId && u.IsActive);

            if (targetFormUser == null)
            {
                return BadRequest(new { message = "کاربر ارشد جایگزین فرم‌ها یافت نشد یا غیرفعال است." });
            }

            bool isSuperOrAdmin = targetFormUser.UserRoles.Any(r => r.Role.RoleName == "SuperUser" || r.Role.RoleName == "Admin");
            if (!isSuperOrAdmin)
            {
                return BadRequest(new { message = "مالکیت فرم‌ها تنها به کاربران ارشد (SuperUser) فعال یا مدیر سیستم قابل انتقال است." });
            }
        }

        using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            var adminId = GetCurrentUserId();

            // ۱. واگذاری خودکار وظایف باز کارتابل به کاربر جایگزین
            if (targetTaskUser != null && pendingTasks.Count > 0)
            {
                foreach (var task in pendingTasks)
                {
                    task.CurrentHandlerUserID = targetTaskUser.UserID;
                    _context.WorkflowHistory.Add(new WorkflowHistory
                    {
                        SubmissionID = task.SubmissionID,
                        ActionTaken = "Reassigned",
                        ActionByUserID = adminId > 0 ? adminId : userId,
                        ActionAt = DateTime.UtcNow,
                        NewStatus = task.WorkflowStatus,
                        PreviousStatus = task.WorkflowStatus,
                        Comments = $"واگذاری خودکار وظیفه کارتابل به «{targetTaskUser.DisplayName}» به دلیل غیرفعال‌سازی حساب «{user.DisplayName}»."
                    });
                }
            }

            // ۲. انتقال مالکیت کلیه فرم‌های ایجادشده به کاربر ارشد جایگزین
            if (targetFormUser != null && ownedForms.Count > 0)
            {
                var transferredFormCodes = ownedForms.Select(f => f.FormCode).Distinct().ToList();
                foreach (var f in ownedForms)
                {
                    f.CreatedByUserID = targetFormUser.UserID;
                }

                var oldShares = await _context.FormDefinitionShares
                    .Where(s => transferredFormCodes.Contains(s.FormKey) && s.SharedWithUserId == targetFormUser.UserID)
                    .ToListAsync();
                if (oldShares.Count > 0)
                {
                    _context.FormDefinitionShares.RemoveRange(oldShares);
                }
            }

            // ۳. غیرفعال‌سازی کاربر
            user.IsActive = false;
            await _context.SaveChangesAsync();
            await transaction.CommitAsync();

            string resultMsg = $"حساب کاربری «{user.DisplayName}» با موفقیت غیرفعال گردید.";
            if (targetTaskUser != null)
                resultMsg += $" تعداد {pendingCount} وظیفه کارتابل به «{targetTaskUser.DisplayName}» منتقل شد.";
            if (targetFormUser != null)
                resultMsg += $" مالکیت {ownedFormsCount} فرم سازمانی به «{targetFormUser.DisplayName}» واگذار گردید.";

            return Ok(new
            {
                message = resultMsg,
                isActive = false,
                transferredTasksCount = pendingCount,
                transferredFormsCount = ownedFormsCount
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            return StatusCode(500, new { message = "خطا در فرآیند غیرفعال‌سازی و انتقال: " + ex.Message });
        }
    }

    private int GetCurrentUserId()
    {
        var idClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier);
        if (idClaim != null && int.TryParse(idClaim.Value, out var uid)) return uid;
        return 0;
    }

    [HttpPost("{userId}/unlock")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UnlockUser(int userId)
    {
        var user = await _context.AppUsers.FindAsync(userId);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        user.LockoutEnd = null;
        user.AccessFailedCount = 0;
        await _context.SaveChangesAsync();

        return Ok(new { success = true, message = $"قفل حساب کاربری '{user.DisplayName ?? user.Username}' با موفقیت باز شد." });
    }

    [HttpDelete("{userId}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> Delete(int userId)
    {
        var user = await _context.AppUsers.FindAsync(userId);
        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        if (user.Username.Equals("local_admin", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "امکان حذف کاربر ادمین اصلی سیستم وجود ندارد." });
        }

        var pendingCount = await _context.FormSubmissions
            .CountAsync(s => s.CurrentHandlerUserID == userId && s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed");

        if (pendingCount > 0)
        {
            return BadRequest(new { message = $"کارتابل این کاربر خالی نیست ({pendingCount} وظیفه در انتظار اقدام). ابتدا وظایف او را به همکار دیگری منتقل کنید." });
        }

        user.IsActive = false;
        user.Username = $"[Deleted_{user.UserID}]_{user.Username}";
        user.DisplayName = $"{user.DisplayName} (حذف شده)";
        user.PasswordHash = null;

        var userRoles = await _context.AppUserRoles.Where(ur => ur.UserID == userId).ToListAsync();
        _context.AppUserRoles.RemoveRange(userRoles);

        var groupMembers = await _context.UserGroupMembers.Where(gm => gm.UserID == userId).ToListAsync();
        _context.UserGroupMembers.RemoveRange(groupMembers);

        await _context.SaveChangesAsync();
        return Ok(new { message = "کاربر با موفقیت حذف گردید و سوابق آن در سیستم آرشیو شد." });
    }

    [HttpPost("{userId}/roles")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateUserRoles(int userId, [FromBody] List<string> roleNames)
    {
        var user = await _context.AppUsers
            .Include(u => u.UserRoles)
            .FirstOrDefaultAsync(u => u.UserID == userId);

        if (user == null) return NotFound(new { message = "کاربر یافت نشد." });

        _context.AppUserRoles.RemoveRange(user.UserRoles);

        var roles = await _context.AppRoles.Where(r => roleNames.Contains(r.RoleName)).ToListAsync();
        foreach (var r in roles)
        {
            _context.AppUserRoles.Add(new AppUserRole { UserID = userId, RoleID = r.RoleID, AssignedAt = DateTime.UtcNow });
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "نقش‌های کاربر با موفقیت به‌روزرسانی شد." });
    }
}