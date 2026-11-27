using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using BPMS.Server.Controllers;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public class WorkflowService : IWorkflowService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<WorkflowService> _logger;
    private readonly IEmailService _emailService;
    private readonly IWebHostEnvironment? _environment;

    public WorkflowService(
        ApplicationDbContext context, 
        ILogger<WorkflowService> logger,
        IEmailService emailService,
        IWebHostEnvironment? environment = null)
    {
        _context = context;
        _logger = logger;
        _emailService = emailService;
        _environment = environment;
    }

    public async Task<CartableItemDto> SubmitFormAsync(SubmitFormDto dto, int currentUserId)
    {
        var form = await _context.Forms.FindAsync(dto.FormId);
        if (form == null || form.Status != "Active")
        {
            throw new InvalidOperationException("فرم یافت نشد یا در وضعیت فعال قرار ندارد.");
        }

        try
        {
            using var doc = JsonDocument.Parse(dto.FormDataJson);
        }
        catch (JsonException ex)
        {
            throw new ArgumentException($"فرمت اطلاعات ارسالی نامعتبر است: {ex.Message}", nameof(dto.FormDataJson));
        }

        var policy = ExtractWorkflowPolicy(form.SchemaJSON);
        var trackingCode = $"TRK-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";

        // انتقال فایل‌های موقت به پوشه اختصاصی کد رهگیری و به‌روزرسانی DataJSON
        var uploadsRoot = SubmissionsController.GetUploadsRootStatic(_environment?.WebRootPath);
        var (promotedJson, _) = SubmissionsController.PromoteTempFilesToTrackingFolder(trackingCode, dto.FormDataJson, uploadsRoot);
        dto.FormDataJson = promotedJson;

        // ۱. اگر فرآیند تایید ندارد (ثبت مستقیم / Direct Logging)
        if (policy.Steps == null || policy.Steps.Count == 0)
        {
            var initialHash = ComputeDataHash(dto.FormDataJson, DateTime.UtcNow, currentUserId);
            var completedSubmission = new FormSubmission
            {
                FormID = dto.FormId,
                TrackingCode = trackingCode,
                DataJSON = dto.FormDataJson,
                WorkflowStatus = "Completed",
                SubmittedByUserID = currentUserId,
                SubmittedAt = DateTime.UtcNow,
                CompletedAt = DateTime.UtcNow,
                CurrentHandlerUserID = null,
                DataHash = initialHash,
                IsLocked = true
            };

            _context.FormSubmissions.Add(completedSubmission);
            await _context.SaveChangesAsync();

            await AddHistoryAsync(completedSubmission.SubmissionID, "SubmitDirect", null, "Completed", dto.Comment ?? "ثبت مستقیم و مختومه بدون نیاز به تایید", currentUserId);
            await AddAuditLogAsync(currentUserId, "FormSubmittedDirect", completedSubmission.SubmissionID, $"فرم '{form.Title}' ثبت مستقیم شد. کد رهگیری: {trackingCode}");
            await HandleCcSharesAsync(completedSubmission.SubmissionID, dto, policy, currentUserId);

            return (await GetSubmissionDetailsAsync(completedSubmission.SubmissionID, currentUserId))!;
        }

        // ۲. گردش‌کار ترتیبی چندمرحله‌ای
        var firstValidStep = FindNextValidStep(policy.Steps, 0, dto.FormDataJson);
        string initialStatus = firstValidStep != null ? $"PendingStep_{firstValidStep.StepIndex}:{firstValidStep.StepName}" : "Approved";
        bool isDirectApproved = firstValidStep == null;

        int? singleHandlerId = (firstValidStep != null && firstValidStep.Approvers.Count == 1 && firstValidStep.Approvers[0].Type == "User")
            ? firstValidStep.Approvers[0].Id
            : null;

        var submission = new FormSubmission
        {
            FormID = dto.FormId,
            TrackingCode = trackingCode,
            DataJSON = dto.FormDataJson,
            WorkflowStatus = initialStatus,
            SubmittedByUserID = currentUserId,
            SubmittedAt = DateTime.UtcNow,
            CurrentHandlerUserID = singleHandlerId,
            CompletedAt = isDirectApproved ? DateTime.UtcNow : null,
            DataHash = isDirectApproved ? ComputeDataHash(dto.FormDataJson, DateTime.UtcNow, currentUserId) : null,
            IsLocked = isDirectApproved
        };

        _context.FormSubmissions.Add(submission);
        await _context.SaveChangesAsync();

        await AddHistoryAsync(submission.SubmissionID, "Submit", null, submission.WorkflowStatus, dto.Comment ?? "ثبت و آغاز گردش‌کار تاییدات", currentUserId);
        await AddAuditLogAsync(currentUserId, "FormSubmitted", submission.SubmissionID, $"فرم '{form.Title}' ارسال شد. کد رهگیری: {trackingCode}");
        await HandleCcSharesAsync(submission.SubmissionID, dto, policy, currentUserId);

        if (firstValidStep != null)
        {
            _emailService.EnqueueWorkflowTaskAssigned(submission.SubmissionID, firstValidStep.StepName);
        }

        return (await GetSubmissionDetailsAsync(submission.SubmissionID, currentUserId))!;
    }

    public async Task<IEnumerable<CartableItemDto>> GetInboxAsync(int currentUserId)
    {
        var delegatedUserIds = await GetActiveDelegatorUserIdsAsync(currentUserId);
        var targetUserIds = new HashSet<int>(delegatedUserIds) { currentUserId };

        var userGroupIds = await _context.UserGroupMembers
            .Where(m => targetUserIds.Contains(m.UserID))
            .Select(m => m.GroupID)
            .Distinct()
            .ToListAsync();

        var pendingSubmissions = await _context.FormSubmissions
            .Include(s => s.Form)
            .Include(s => s.SubmittedByUser)
            .Include(s => s.CurrentHandlerUser)
            .Where(s => s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed")
            .OrderByDescending(s => s.SubmittedAt)
            .ToListAsync();

        var inboxList = new List<CartableItemDto>();
        var pendingSubmissionIds = new HashSet<long>();

        var pendingSubIds = pendingSubmissions.Select(s => s.SubmissionID).ToList();
        var allPendingHistories = await _context.WorkflowHistory
            .Where(h => pendingSubIds.Contains(h.SubmissionID))
            .OrderBy(h => h.ActionAt)
            .ToListAsync();
        var historyMap = allPendingHistories.GroupBy(h => h.SubmissionID).ToDictionary(g => g.Key, g => g.ToList());

        var groupMembers = await _context.UserGroupMembers.ToListAsync();
        var groupMembersMap = groupMembers
            .GroupBy(m => m.GroupID)
            .ToDictionary(g => g.Key, g => g.Select(m => m.UserID).ToHashSet());

        foreach (var s in pendingSubmissions)
        {
            var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
            var currentStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
            var subHist = historyMap.GetValueOrDefault(s.SubmissionID) ?? new List<WorkflowHistory>();

            // بررسی تایید مرحله‌ای قبلی توسط کاربر یا وکلای او برای مرحله جاری (جلوگیری از ماندن در کارتابل در حالت اجماع)
            bool alreadyApprovedThisStep = subHist.Any(h =>
                targetUserIds.Contains(h.ActionByUserID) &&
                (h.PreviousStatus == s.WorkflowStatus || h.NewStatus == s.WorkflowStatus) &&
                (h.ActionTaken == "StepApproved_Single" || h.ActionTaken == "StepApprove" || h.ActionTaken == "Approve" || h.ActionTaken == "FinalApprove"));

            var pendingApprovers = GetPendingStepApprovers(s, currentStep, subHist, groupMembersMap);

            if (pendingApprovers.Any(uid => targetUserIds.Contains(uid)))
            {
                string state = alreadyApprovedThisStep ? "Approved" : "Pending";
                inboxList.Add(MapToCartableDto(s, currentStep, policy.Steps?.Count ?? 1, state));
                pendingSubmissionIds.Add(s.SubmissionID);
            }
        }

        // واکشی درخواست‌هایی که قبلاً توسط این کاربر یا گروه او بررسی و تایید یا رد شده‌اند
        var actionTypes = new[] { "Reject", "Approve", "StepApprove", "StepApproved_Single", "FinalApprove" };

        var userHistory = await _context.WorkflowHistory
            .Where(h => !pendingSubmissionIds.Contains(h.SubmissionID) && actionTypes.Contains(h.ActionTaken))
            .OrderByDescending(h => h.ActionAt)
            .ToListAsync();

        if (userHistory.Count > 0)
        {
            var candidateSubmissionIds = userHistory.Select(h => h.SubmissionID).Distinct().ToList();

            var pastSubmissions = await _context.FormSubmissions
                .Include(s => s.Form)
                .Include(s => s.SubmittedByUser)
                .Include(s => s.CurrentHandlerUser)
                .Where(s => candidateSubmissionIds.Contains(s.SubmissionID))
                .ToListAsync();

            var historyBySubmission = userHistory.GroupBy(h => h.SubmissionID)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var s in pastSubmissions)
            {
                if (pendingSubmissionIds.Contains(s.SubmissionID)) continue;

                var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
                var subHistory = historyBySubmission.GetValueOrDefault(s.SubmissionID) ?? new List<WorkflowHistory>();

                // ۱. اقدام مستقیم کاربر جاری یا وکلای او در سوابق
                var directAction = subHistory.FirstOrDefault(h => targetUserIds.Contains(h.ActionByUserID));
                if (directAction != null)
                {
                    string actionState = directAction.ActionTaken == "Reject" ? "Rejected" : "Approved";
                    var currentStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
                    inboxList.Add(MapToCartableDto(s, currentStep, policy.Steps?.Count ?? 1, actionState));
                    continue;
                }

                // ۲. اقدام از طریق گروه کاربری در گام مربوطه
                bool isUserGroupApprover = policy.Steps != null && policy.Steps.Any(st => st.Approvers != null && st.Approvers.Any(a => a.Type == "Group" && userGroupIds.Contains(a.Id)));
                if (isUserGroupApprover)
                {
                    var groupAction = subHistory.FirstOrDefault();
                    if (groupAction != null)
                    {
                        string actionState = (s.WorkflowStatus == "Rejected" || groupAction.ActionTaken == "Reject") ? "Rejected" : "Approved";
                        var currentStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
                        inboxList.Add(MapToCartableDto(s, currentStep, policy.Steps?.Count ?? 1, actionState));
                    }
                }
            }

            var allSubs = pendingSubmissions.Concat(pastSubmissions).ToList();
            await PopulateStepsProgressAsync(inboxList, allSubs);
        }
        else
        {
            await PopulateStepsProgressAsync(inboxList, pendingSubmissions);
        }

        return inboxList.OrderByDescending(s => s.SubmittedAt).ToList();
    }

    public async Task<IEnumerable<CartableItemDto>> GetOutboxAsync(int currentUserId)
    {
        var list = await _context.FormSubmissions
            .Include(s => s.Form)
            .Include(s => s.SubmittedByUser)
            .Include(s => s.CurrentHandlerUser)
            .Where(s => s.SubmittedByUserID == currentUserId)
            .OrderByDescending(s => s.SubmittedAt)
            .ToListAsync();

        if (list.Count == 0) return Enumerable.Empty<CartableItemDto>();

        var dtos = list.Select(s =>
        {
            var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
            var currStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
            return MapToCartableDto(s, currStep, policy.Steps?.Count ?? 1, "Pending");
        }).ToList();

        await PopulateStepsProgressAsync(dtos, list);
        return dtos;
    }

    public async Task<IEnumerable<CartableItemDto>> GetCcItemsAsync(int currentUserId)
    {
        var sharedSubmissionIds = await _context.FormShares
            .Where(sh => sh.SharedWithUserID == currentUserId)
            .Select(sh => sh.SubmissionID)
            .Distinct()
            .ToListAsync();

        var list = await _context.FormSubmissions
            .Include(s => s.Form)
            .Include(s => s.SubmittedByUser)
            .Include(s => s.CurrentHandlerUser)
            .Where(s => sharedSubmissionIds.Contains(s.SubmissionID))
            .OrderByDescending(s => s.SubmittedAt)
            .ToListAsync();

        var dtos = list.Select(s =>
        {
            var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
            var currStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
            var dto = MapToCartableDto(s, currStep, policy.Steps?.Count ?? 1, "Pending");
            dto.IsCc = true;
            return dto;
        }).ToList();

        await PopulateStepsProgressAsync(dtos, list);
        return dtos;
    }

    public async Task<CartableItemDto?> GetSubmissionDetailsAsync(long submissionId, int currentUserId)
    {
        var s = await _context.FormSubmissions
            .Include(sub => sub.Form)
            .Include(sub => sub.SubmittedByUser)
            .Include(sub => sub.CurrentHandlerUser)
            .FirstOrDefaultAsync(sub => sub.SubmissionID == submissionId);

        if (s == null) return null;

        var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
        var currStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
        var dto = MapToCartableDto(s, currStep, policy.Steps?.Count ?? 1, "Pending");
        dto.StepsProgress = await GetStepsProgressAsync(submissionId);
        return dto;
    }

    public async Task<bool> ProcessTransitionAsync(long submissionId, TransitionTaskDto dto, int currentUserId)
    {
        var submission = await _context.FormSubmissions
            .Include(s => s.Form)
            .FirstOrDefaultAsync(s => s.SubmissionID == submissionId);

        if (submission == null || submission.IsLocked) return false;

        var policy = ExtractWorkflowPolicy(submission.Form?.SchemaJSON ?? "{}");
        var currentStep = GetCurrentStepFromStatus(submission.WorkflowStatus, policy.Steps);

        string actionLower = dto.Action.ToLowerInvariant();
        var previousStatus = submission.WorkflowStatus;

        if (actionLower == "reject")
        {
            submission.WorkflowStatus = "Rejected";
            submission.CompletedAt = DateTime.UtcNow;
            submission.CurrentHandlerUserID = null;
            submission.IsLocked = true;
            submission.DataHash = ComputeDataHash(submission.DataJSON, submission.CompletedAt.Value, currentUserId);

            await AddHistoryAsync(submission.SubmissionID, "Reject", previousStatus, "Rejected", dto.Comment ?? "رد درخواست", currentUserId);
            await AddAuditLogAsync(currentUserId, "Task_Reject", submission.SubmissionID, $"درخواست با کد {submission.TrackingCode} رد شد.");
            await _context.SaveChangesAsync();
            return true;
        }

        if (actionLower == "refer")
        {
            if (!dto.ReferToUserId.HasValue) throw new ArgumentException("شناسه کاربر ارجاع‌شونده الزامی است.");
            submission.WorkflowStatus = $"ReferredTo_{dto.ReferToUserId.Value}";
            submission.CurrentHandlerUserID = dto.ReferToUserId.Value;

            await AddHistoryAsync(submission.SubmissionID, "Refer", previousStatus, submission.WorkflowStatus, dto.Comment, currentUserId);
            await _context.SaveChangesAsync();
            _emailService.EnqueueWorkflowTaskAssigned(submission.SubmissionID, "ارجاع مستقیم");
            return true;
        }

        if (actionLower == "approve")
        {
            bool hasNextStep = false;
            string? nextStepName = null;

            if (currentStep != null)
            {
                // ارزیابی منطق تایید همگانی (ALL) در برابر تایید اولویت‌دار (ANY) برای تمامی افراد و گروه‌های مرحله
                if (currentStep.ApprovalRule.Equals("ALL", StringComparison.OrdinalIgnoreCase))
                {
                    var subHistories = await _context.WorkflowHistory
                        .Where(h => h.SubmissionID == submission.SubmissionID)
                        .OrderBy(h => h.ActionAt)
                        .ToListAsync();

                    var groupMembers = await _context.UserGroupMembers.ToListAsync();
                    var groupMembersMap = groupMembers
                        .GroupBy(m => m.GroupID)
                        .ToDictionary(g => g.Key, g => g.Select(m => m.UserID).ToHashSet());

                    var requiredUserIds = GetStepCandidateApprovers(submission, currentStep, subHistories, groupMembersMap);
                    if (submission.SubmittedByUserID.HasValue) requiredUserIds.Remove(submission.SubmittedByUserID.Value);

                    if (requiredUserIds.Count > 1)
                    {
                        var approvedUserIdsInThisStep = subHistories
                            .Where(h => h.ActionTaken == "StepApproved_Single" && (h.PreviousStatus == previousStatus || h.NewStatus == previousStatus))
                            .Select(h => h.ActionByUserID)
                            .Distinct()
                            .ToHashSet();

                        var approvedSet = new HashSet<int>(approvedUserIdsInThisStep) { currentUserId };
                        bool allApproved = requiredUserIds.All(reqId => approvedSet.Contains(reqId));

                        if (!allApproved)
                        {
                            // هنوز نفراتی باقی مانده‌اند (تایید میانی): فقط ثبت تایید مرحله‌ای کاربر و توقف
                            await AddHistoryAsync(submission.SubmissionID, "StepApproved_Single", previousStatus, previousStatus, dto.Comment ?? "تایید مرحله‌ای کاربر", currentUserId);
                            await _context.SaveChangesAsync();
                            return true;
                        }
                    }
                }

                // ارجاع به مرحله معتبر بعدی
                var nextStep = FindNextValidStep(policy.Steps, currentStep.StepIndex + 1, submission.DataJSON);
                if (nextStep != null)
                {
                    hasNextStep = true;
                    nextStepName = nextStep.StepName;
                    submission.WorkflowStatus = $"PendingStep_{nextStep.StepIndex}:{nextStep.StepName}";
                    submission.CurrentHandlerUserID = (nextStep.Approvers.Count == 1 && nextStep.Approvers[0].Type == "User")
                        ? nextStep.Approvers[0].Id
                        : null;
                    await AddHistoryAsync(submission.SubmissionID, "StepApprove", previousStatus, submission.WorkflowStatus, dto.Comment ?? $"تایید مرحله '{currentStep.StepName}' و ارجاع به '{nextStep.StepName}'", currentUserId);
                }
                else
                {
                    submission.WorkflowStatus = "Approved";
                    submission.CompletedAt = DateTime.UtcNow;
                    submission.CurrentHandlerUserID = null;
                    submission.IsLocked = true;
                    submission.DataHash = ComputeDataHash(submission.DataJSON, submission.CompletedAt.Value, currentUserId);
                    await AddHistoryAsync(submission.SubmissionID, "FinalApprove", previousStatus, "Approved", dto.Comment ?? "تایید نهایی و مختومه شدن پرونده", currentUserId);
                }
            }
            else
            {
                submission.WorkflowStatus = "Approved";
                submission.CompletedAt = DateTime.UtcNow;
                submission.CurrentHandlerUserID = null;
                submission.IsLocked = true;
                submission.DataHash = ComputeDataHash(submission.DataJSON, submission.CompletedAt.Value, currentUserId);
                await AddHistoryAsync(submission.SubmissionID, "Approve", previousStatus, "Approved", dto.Comment, currentUserId);
            }

            await AddAuditLogAsync(currentUserId, "Task_Approve", submission.SubmissionID, $"تغییر وضعیت به {submission.WorkflowStatus}");
            await _context.SaveChangesAsync();

            if (hasNextStep && !string.IsNullOrEmpty(nextStepName))
            {
                _emailService.EnqueueWorkflowTaskAssigned(submission.SubmissionID, nextStepName);
            }

            return true;
        }

        return false;
    }

    public async Task<IEnumerable<WorkflowHistoryItemDto>> GetSubmissionHistoryAsync(long submissionId)
    {
        var submission = await _context.FormSubmissions
            .Include(s => s.Form)
            .FirstOrDefaultAsync(s => s.SubmissionID == submissionId);

        RuntimePolicy? policy = submission?.Form != null ? ExtractWorkflowPolicy(submission.Form.SchemaJSON) : null;

        var history = await _context.WorkflowHistory
            .Include(h => h.ActionByUser)
            .Where(h => h.SubmissionID == submissionId)
            .OrderBy(h => h.ActionAt)
            .ToListAsync();

        return history.Select(h =>
        {
            string? stepName = null;
            int? stepIdx = null;

            if (!string.IsNullOrWhiteSpace(h.PreviousStatus) && h.PreviousStatus.StartsWith("PendingStep_"))
            {
                var parts = h.PreviousStatus.Split(new[] { '_', ':' }, 3);
                if (parts.Length > 1 && int.TryParse(parts[1], out var parsedIdx))
                {
                    stepIdx = parsedIdx;
                }
                if (h.PreviousStatus.Contains(':'))
                {
                    stepName = h.PreviousStatus.Substring(h.PreviousStatus.IndexOf(':') + 1).Trim();
                }
            }

            if (stepIdx == null && !string.IsNullOrWhiteSpace(h.NewStatus) && h.NewStatus.StartsWith("PendingStep_"))
            {
                var parts = h.NewStatus.Split(new[] { '_', ':' }, 3);
                if (parts.Length > 1 && int.TryParse(parts[1], out var parsedIdx))
                {
                    stepIdx = parsedIdx;
                }
                if (string.IsNullOrWhiteSpace(stepName) && h.NewStatus.Contains(':'))
                {
                    stepName = h.NewStatus.Substring(h.NewStatus.IndexOf(':') + 1).Trim();
                }
            }

            if (string.IsNullOrWhiteSpace(stepName) && stepIdx.HasValue && policy != null)
            {
                var matched = policy.Steps.FirstOrDefault(s => s.StepIndex == stepIdx.Value);
                if (matched != null)
                {
                    stepName = matched.StepName;
                }
            }

            if (h.ActionTaken == "Submit" || h.ActionTaken == "SubmitDirect")
            {
                stepName = "ثبت اولیه درخواست";
                stepIdx = 0;
            }
            else if (h.ActionTaken == "FinalApprove" && string.IsNullOrWhiteSpace(stepName))
            {
                stepName = "تایید نهایی و خاتمه";
            }

            return new WorkflowHistoryItemDto
            {
                HistoryId = h.HistoryID,
                SubmissionId = h.SubmissionID,
                ActionTaken = h.ActionTaken,
                PreviousStatus = h.PreviousStatus,
                NewStatus = h.NewStatus,
                Comments = h.Comments,
                ActionByUserId = h.ActionByUserID,
                ActionByUserName = (h.ActionTaken == "SubmitDirect" || (h.Comments != null && h.Comments.Contains("بدون نیاز به تایید")))
                    ? "سیستمی"
                    : (h.ActionByUser?.DisplayName ?? h.ActionByUser?.Username ?? "ناشناس"),
                ActionAt = h.ActionAt,
                StepName = stepName,
                StepIndex = stepIdx
            };
        });
    }

    public async Task<bool> SetDelegationAsync(int fromUserId, DelegationDto dto)
    {
        var key = $"Delegation:{fromUserId}";
        var payload = JsonSerializer.Serialize(dto);
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == key);
        if (setting == null)
        {
            _context.SystemSettings.Add(new SystemSetting { SettingKey = key, SettingValue = payload, UpdatedAt = DateTime.UtcNow });
        }
        else
        {
            setting.SettingValue = payload;
            setting.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<DelegationDto?> GetActiveDelegationAsync(int userId)
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == $"Delegation:{userId}");
        if (setting == null || string.IsNullOrWhiteSpace(setting.SettingValue)) return null;
        try { return JsonSerializer.Deserialize<DelegationDto>(setting.SettingValue); } catch { return null; }
    }

    public async Task<bool> CancelDelegationAsync(int fromUserId)
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == $"Delegation:{fromUserId}");
        if (setting != null)
        {
            _context.SystemSettings.Remove(setting);
            await _context.SaveChangesAsync();
        }
        return true;
    }

    #region Helper Methods

    private class RuntimeApprover
    {
        public string Type { get; set; } = string.Empty;
        public int Id { get; set; }
    }

    private class RuntimeCondition
    {
        public string Field { get; set; } = string.Empty;
        public string Operator { get; set; } = "==";
        public string Value { get; set; } = string.Empty;
    }

    private class RuntimeStep
    {
        public int StepIndex { get; set; }
        public string StepName { get; set; } = string.Empty;
        public List<RuntimeApprover> Approvers { get; set; } = new();
        public string ApprovalRule { get; set; } = "ANY";
        public string ConditionLogic { get; set; } = "AND";
        public List<RuntimeCondition> Conditions { get; set; } = new();
    }

    private class RuntimePolicy
    {
        public List<RuntimeStep> Steps { get; set; } = new();
        public List<int> DefaultCcUserIds { get; set; } = new();
        public List<int> DefaultCcGroupIds { get; set; } = new();
    }

    private static bool TryGetPropCaseInsensitive(JsonElement el, out JsonElement val, params string[] candidateNames)
    {
        val = default;
        if (el.ValueKind != JsonValueKind.Object) return false;

        foreach (var prop in el.EnumerateObject())
        {
            foreach (var cand in candidateNames)
            {
                if (string.Equals(prop.Name, cand, StringComparison.OrdinalIgnoreCase))
                {
                    val = prop.Value;
                    return true;
                }
            }
        }
        return false;
    }

    private static RuntimePolicy ExtractWorkflowPolicy(string schemaJson)
    {
        var result = new RuntimePolicy();
        if (string.IsNullOrWhiteSpace(schemaJson)) return result;

        try
        {
            using var doc = JsonDocument.Parse(schemaJson);
            var root = doc.RootElement;
            if (root.ValueKind == JsonValueKind.String)
            {
                var innerStr = root.GetString();
                if (!string.IsNullOrWhiteSpace(innerStr))
                {
                    using var innerDoc = JsonDocument.Parse(innerStr);
                    return ParsePolicyElement(innerDoc.RootElement);
                }
            }
            return ParsePolicyElement(root);
        }
        catch
        {
            return result;
        }
    }

    private static RuntimePolicy ParsePolicyElement(JsonElement root)
    {
        var result = new RuntimePolicy();

        // ۱. بررسی محل قرارگیری پالیسی: چه داخل workflowPolicy، چه policy، یا مستقیماً روی ریشه
        JsonElement wp = root;
        if (TryGetPropCaseInsensitive(root, out var wpFound, "workflowPolicy", "WorkflowPolicy", "workflow_policy", "policy", "Policy", "workflow", "Workflow"))
        {
            wp = wpFound;
        }

        // ۲. استخراج کاربران رونوشت پیش‌فرض
        if ((TryGetPropCaseInsensitive(wp, out var ccUsers, "defaultCcUserIds", "DefaultCcUserIds", "ccUserIds", "ccUsers") ||
             TryGetPropCaseInsensitive(root, out ccUsers, "defaultCcUserIds", "DefaultCcUserIds", "ccUserIds", "ccUsers")) &&
            ccUsers.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in ccUsers.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var uid)) result.DefaultCcUserIds.Add(uid);
                else if (item.ValueKind == JsonValueKind.String && int.TryParse(item.GetString(), out var uidStr)) result.DefaultCcUserIds.Add(uidStr);
            }
        }

        // ۳. استخراج گروه‌های رونوشت پیش‌فرض
        if ((TryGetPropCaseInsensitive(wp, out var ccGroups, "defaultCcGroupIds", "DefaultCcGroupIds", "ccGroupIds", "ccGroups") ||
             TryGetPropCaseInsensitive(root, out ccGroups, "defaultCcGroupIds", "DefaultCcGroupIds", "ccGroupIds", "ccGroups")) &&
            ccGroups.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in ccGroups.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var gid)) result.DefaultCcGroupIds.Add(gid);
                else if (item.ValueKind == JsonValueKind.String && int.TryParse(item.GetString(), out var gidStr)) result.DefaultCcGroupIds.Add(gidStr);
            }
        }

        // ۴. استخراج مراحل گردش‌کار (steps یا workflowSteps)
        JsonElement stepsEl = default;
        bool hasSteps = TryGetPropCaseInsensitive(wp, out stepsEl, "steps", "Steps", "workflowSteps", "WorkflowSteps", "workflow_steps", "stepList", "stepsList") ||
                        (wp.ValueKind != JsonValueKind.Undefined && TryGetPropCaseInsensitive(root, out stepsEl, "steps", "Steps", "workflowSteps", "WorkflowSteps", "workflow_steps", "stepList", "stepsList"));

        if (hasSteps && stepsEl.ValueKind == JsonValueKind.Array)
        {
            int idxCounter = 0;
            foreach (var stEl in stepsEl.EnumerateArray())
            {
                int stepIdx = idxCounter;
                if (TryGetPropCaseInsensitive(stEl, out var si, "stepIndex", "StepIndex", "index", "Index", "id", "Id"))
                {
                    if (si.ValueKind == JsonValueKind.Number && si.TryGetInt32(out var parsedIdx)) stepIdx = parsedIdx;
                    else if (si.ValueKind == JsonValueKind.String && int.TryParse(si.GetString(), out var parsedStrIdx)) stepIdx = parsedStrIdx;
                }

                string stepName = "";
                if (TryGetPropCaseInsensitive(stEl, out var sn, "stepName", "StepName", "title", "Title", "name", "Name", "label", "Label", "step_name"))
                {
                    stepName = sn.GetString() ?? "";
                }

                if (string.IsNullOrWhiteSpace(stepName))
                    stepName = $"مرحله {idxCounter + 1}";

                string approvalRule = "ALL";
                if (TryGetPropCaseInsensitive(stEl, out var ar, "approvalRule", "ApprovalRule", "rule", "Rule", "approval_rule", "mode"))
                {
                    var rawRule = ar.GetString()?.Trim().ToUpperInvariant();
                    if (!string.IsNullOrEmpty(rawRule)) approvalRule = rawRule;
                }

                string conditionLogic = "AND";
                if (TryGetPropCaseInsensitive(stEl, out var cl, "conditionLogic", "ConditionLogic", "logic", "Logic", "condition_logic"))
                {
                    var rawLogic = cl.GetString()?.Trim().ToUpperInvariant();
                    if (!string.IsNullOrEmpty(rawLogic)) conditionLogic = rawLogic;
                }

                var step = new RuntimeStep
                {
                    StepIndex = stepIdx,
                    StepName = stepName,
                    ApprovalRule = approvalRule,
                    ConditionLogic = conditionLogic
                };

                // بررسی تاییدکنندگان (approvers یا assignees)
                if (TryGetPropCaseInsensitive(stEl, out var appArr, "approvers", "Approvers", "assignees", "Assignees", "approverList", "approver_list") &&
                    appArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var a in appArr.EnumerateArray())
                    {
                        if (a.ValueKind == JsonValueKind.Object)
                        {
                            string t = "";
                            if (TryGetPropCaseInsensitive(a, out var tp, "type", "Type", "approverType"))
                                t = tp.GetString() ?? "";

                            int aId = 0;
                            bool hasId = false;
                            if (TryGetPropCaseInsensitive(a, out var idEl, "id", "Id", "userId", "groupId", "approverId"))
                            {
                                if (idEl.ValueKind == JsonValueKind.Number && idEl.TryGetInt32(out aId)) hasId = true;
                                else if (idEl.ValueKind == JsonValueKind.String)
                                {
                                    var strId = idEl.GetString() ?? "";
                                    if (strId.Contains(':'))
                                    {
                                        var parts = strId.Split(':');
                                        if (string.IsNullOrEmpty(t)) t = parts[0];
                                        if (int.TryParse(parts[1], out aId)) hasId = true;
                                    }
                                    else if (int.TryParse(strId, out aId)) hasId = true;
                                }
                            }

                            if (string.IsNullOrEmpty(t))
                            {
                                if (TryGetPropCaseInsensitive(a, out _, "userId", "UserId")) t = "User";
                                else if (TryGetPropCaseInsensitive(a, out _, "groupId", "GroupId")) t = "Group";
                                else t = "User";
                            }

                            if (hasId && !string.IsNullOrEmpty(t))
                            {
                                step.Approvers.Add(new RuntimeApprover { Type = t, Id = aId });
                            }
                        }
                        else if (a.ValueKind == JsonValueKind.String)
                        {
                            var sVal = a.GetString() ?? "";
                            if (sVal.Contains(':'))
                            {
                                var parts = sVal.Split(':');
                                if (int.TryParse(parts[1], out var parsedId))
                                    step.Approvers.Add(new RuntimeApprover { Type = parts[0], Id = parsedId });
                            }
                            else if (int.TryParse(sVal, out var parsedId))
                            {
                                step.Approvers.Add(new RuntimeApprover { Type = "User", Id = parsedId });
                            }
                        }
                        else if (a.ValueKind == JsonValueKind.Number && a.TryGetInt32(out var parsedNumId))
                        {
                            step.Approvers.Add(new RuntimeApprover { Type = "User", Id = parsedNumId });
                        }
                    }
                }

                // پشتیبانی از آرایه‌های selectedUsers / userIds
                if (TryGetPropCaseInsensitive(stEl, out var selUsers, "selectedUsers", "SelectedUsers", "userIds", "UserIds", "users") &&
                    selUsers.ValueKind == JsonValueKind.Array)
                {
                    foreach (var uEl in selUsers.EnumerateArray())
                    {
                        if (uEl.ValueKind == JsonValueKind.Number && uEl.TryGetInt32(out var uid))
                            step.Approvers.Add(new RuntimeApprover { Type = "User", Id = uid });
                        else if (uEl.ValueKind == JsonValueKind.String && int.TryParse(uEl.GetString(), out var uidStr))
                            step.Approvers.Add(new RuntimeApprover { Type = "User", Id = uidStr });
                    }
                }

                // پشتیبانی از آرایه‌های selectedGroups / groupIds
                if (TryGetPropCaseInsensitive(stEl, out var selGroups, "selectedGroups", "SelectedGroups", "groupIds", "GroupIds", "groups") &&
                    selGroups.ValueKind == JsonValueKind.Array)
                {
                    foreach (var gEl in selGroups.EnumerateArray())
                    {
                        if (gEl.ValueKind == JsonValueKind.Number && gEl.TryGetInt32(out var gid))
                            step.Approvers.Add(new RuntimeApprover { Type = "Group", Id = gid });
                        else if (gEl.ValueKind == JsonValueKind.String && int.TryParse(gEl.GetString(), out var gidStr))
                            step.Approvers.Add(new RuntimeApprover { Type = "Group", Id = gidStr });
                    }
                }

                // فیلدهای تکی approverType / approverId
                if (TryGetPropCaseInsensitive(stEl, out var at, "approverType", "ApproverType") &&
                    TryGetPropCaseInsensitive(stEl, out var aid, "approverId", "ApproverId"))
                {
                    int singleId = 0;
                    bool hasSingleId = false;
                    if (aid.ValueKind == JsonValueKind.Number && aid.TryGetInt32(out singleId)) hasSingleId = true;
                    else if (aid.ValueKind == JsonValueKind.String && int.TryParse(aid.GetString(), out singleId)) hasSingleId = true;

                    if (hasSingleId)
                    {
                        step.Approvers.Add(new RuntimeApprover { Type = at.GetString() ?? "User", Id = singleId });
                    }
                }

                // شروط ورود به مرحله
                if (TryGetPropCaseInsensitive(stEl, out var condArr, "conditions", "Conditions") && condArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var c in condArr.EnumerateArray())
                    {
                        var f = TryGetPropCaseInsensitive(c, out var fp, "field", "Field") ? fp.GetString() ?? "" : "";
                        if (!string.IsNullOrWhiteSpace(f))
                        {
                            step.Conditions.Add(new RuntimeCondition
                            {
                                Field = f,
                                Operator = TryGetPropCaseInsensitive(c, out var op, "operator", "Operator") ? op.GetString() ?? "==" : "==",
                                Value = TryGetPropCaseInsensitive(c, out var vp, "value", "Value") ? vp.GetString() ?? "" : ""
                            });
                        }
                    }
                }
                else if (TryGetPropCaseInsensitive(stEl, out var cf, "conditionField", "ConditionField") && !string.IsNullOrWhiteSpace(cf.GetString()))
                {
                    step.Conditions.Add(new RuntimeCondition
                    {
                        Field = cf.GetString()!,
                        Operator = TryGetPropCaseInsensitive(stEl, out var co, "conditionOperator", "ConditionOperator") ? co.GetString() ?? ">" : ">",
                        Value = TryGetPropCaseInsensitive(stEl, out var cv, "conditionValue", "ConditionValue") ? cv.GetString() ?? "" : ""
                    });
                }

                result.Steps.Add(step);
                idxCounter++;
            }
        }

        return result;
    }

    private static RuntimeStep? FindNextValidStep(List<RuntimeStep> steps, int startIndex, string formDataJson)
    {
        for (int i = startIndex; i < steps.Count; i++)
        {
            var step = steps[i];
            if (EvaluateStepConditions(step, formDataJson)) return step;
        }
        return null;
    }

    private static bool EvaluateStepConditions(RuntimeStep step, string formDataJson)
    {
        var activeConditions = step.Conditions.Where(c => !string.IsNullOrWhiteSpace(c.Field)).ToList();
        if (activeConditions.Count == 0) return true;

        try
        {
            using var doc = JsonDocument.Parse(formDataJson);
            var root = doc.RootElement;

            var pc = new PersianCalendar();
            var now = DateTime.Now;
            var todayJalali = $"{pc.GetYear(now):0000}/{pc.GetMonth(now):00}/{pc.GetDayOfMonth(now):00}";

            bool EvaluateSingle(RuntimeCondition cond)
            {
                if (!root.TryGetProperty(cond.Field, out var prop)) return false;

                var actualStr = prop.ValueKind == JsonValueKind.Array
                    ? string.Join(",", prop.EnumerateArray().Select(x => x.ToString()))
                    : prop.ToString().Trim();

                var targetStr = (cond.Value ?? string.Empty).Trim();
                if (targetStr.Equals("@TODAY", StringComparison.OrdinalIgnoreCase))
                    targetStr = todayJalali;

                if (cond.Operator == "contains")
                    return actualStr.Contains(targetStr, StringComparison.OrdinalIgnoreCase);

                if (decimal.TryParse(actualStr, out var numVal) && decimal.TryParse(targetStr, out var targetNum))
                {
                    return cond.Operator switch
                    {
                        ">" => numVal > targetNum,
                        "<" => numVal < targetNum,
                        ">=" => numVal >= targetNum,
                        "<=" => numVal <= targetNum,
                        "==" => numVal == targetNum,
                        "!=" => numVal != targetNum,
                        _ => true
                    };
                }

                int cmp = string.Compare(actualStr, targetStr, StringComparison.OrdinalIgnoreCase);
                return cond.Operator switch
                {
                    "==" => cmp == 0,
                    "!=" => cmp != 0,
                    ">" => cmp > 0,
                    "<" => cmp < 0,
                    ">=" => cmp >= 0,
                    "<=" => cmp <= 0,
                    _ => true
                };
            }

            if (step.ConditionLogic.Equals("OR", StringComparison.OrdinalIgnoreCase))
                return activeConditions.Any(EvaluateSingle);

            return activeConditions.All(EvaluateSingle);
        }
        catch
        {
            return true;
        }
    }

    private static RuntimeStep? GetCurrentStepFromStatus(string? status, List<RuntimeStep>? steps)
    {
        if (string.IsNullOrWhiteSpace(status) || steps == null || steps.Count == 0 || !status.StartsWith("PendingStep_")) return null;
        var parts = status.Split(new[] { '_', ':' });
        if (parts.Length > 1 && int.TryParse(parts[1], out var stepIdx))
        {
            return steps.FirstOrDefault(s => s != null && s.StepIndex == stepIdx);
        }
        return null;
    }

    private static string ComputeDataHash(string dataJson, DateTime completedAt, int approverUserId)
    {
        var raw = $"{dataJson}|{completedAt:O}|{approverUserId}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
    }

    private async Task HandleCcSharesAsync(long submissionId, SubmitFormDto dto, RuntimePolicy policy, int currentUserId)
    {
        var ccUserIds = new HashSet<int>(dto.CcUserIds ?? new List<int>());
        if (policy.DefaultCcUserIds != null)
        {
            foreach (var id in policy.DefaultCcUserIds)
                ccUserIds.Add(id);
        }

        if (policy.DefaultCcGroupIds != null && policy.DefaultCcGroupIds.Count > 0)
        {
            var groupUsers = await _context.UserGroupMembers
                .Where(m => policy.DefaultCcGroupIds.Contains(m.GroupID))
                .Select(m => m.UserID)
                .ToListAsync();
            foreach (var uid in groupUsers)
                ccUserIds.Add(uid);
        }

        foreach (var uid in ccUserIds.Where(id => id != currentUserId))
        {
            _context.FormShares.Add(new FormShare
            {
                SubmissionID = submissionId,
                SharedWithUserID = uid,
                SharedByUserID = currentUserId,
                SharedAt = DateTime.UtcNow
            });
        }
        await _context.SaveChangesAsync();
    }

    private async Task<List<int>> GetActiveDelegatorUserIdsAsync(int delegateeUserId)
    {
        var settings = await _context.SystemSettings
            .Where(s => s.SettingKey.StartsWith("Delegation:"))
            .ToListAsync();

        var delegatorIds = new List<int>();
        foreach (var s in settings)
        {
            try
            {
                var d = JsonSerializer.Deserialize<DelegationDto>(s.SettingValue);
                if (d != null && d.ToUserId == delegateeUserId)
                {
                    if (int.TryParse(s.SettingKey.Split(':')[1], out var fromId))
                        delegatorIds.Add(fromId);
                }
            }
            catch {}
        }
        return delegatorIds;
    }

    private async Task AddHistoryAsync(long subId, string action, string? prev, string next, string? comment, int userId)
    {
        _context.WorkflowHistory.Add(new WorkflowHistory
        {
            SubmissionID = subId,
            ActionTaken = action,
            PreviousStatus = prev,
            NewStatus = next,
            Comments = comment,
            ActionByUserID = userId,
            ActionAt = DateTime.UtcNow
        });
        await _context.SaveChangesAsync();
    }

    private async Task AddAuditLogAsync(int userId, string action, long entityId, string details)
    {
        _context.AuditLogs.Add(new AuditLog
        {
            UserID = userId,
            Action = action,
            EntityName = "FormSubmission",
            EntityID = entityId.ToString(),
            Timestamp = DateTime.UtcNow,
            Details = details
        });
        await _context.SaveChangesAsync();
    }

    private static CartableItemDto MapToCartableDto(
        FormSubmission s,
        RuntimeStep? step = null,
        int totalSteps = 1,
        string actionState = "Pending",
        List<WorkflowStepProgressDto>? stepsProgress = null,
        string? lastComment = null,
        string? currentAssigneeName = null)
    {
        var handlerName = s.CurrentHandlerUser != null ? (!string.IsNullOrWhiteSpace(s.CurrentHandlerUser.DisplayName) ? s.CurrentHandlerUser.DisplayName : s.CurrentHandlerUser.Username) : null;
        return new CartableItemDto
        {
            SubmissionId = s.SubmissionID,
            FormId = s.FormID,
            FormTitle = s.Form?.Title ?? "بدون عنوان",
            TrackingCode = s.TrackingCode ?? string.Empty,
            FormDataJson = s.DataJSON ?? string.Empty,
            FormSchemaJson = s.Form?.SchemaJSON,
            WorkflowStatus = s.WorkflowStatus ?? string.Empty,
            SubmittedByUserId = s.SubmittedByUserID,
            SubmittedByUserName = s.SubmittedByUser != null ? (!string.IsNullOrWhiteSpace(s.SubmittedByUser.DisplayName) ? s.SubmittedByUser.DisplayName : s.SubmittedByUser.Username) : "عمومی / ناشناس",
            SubmittedAt = s.SubmittedAt,
            CurrentHandlerUserId = s.CurrentHandlerUserID,
            CurrentHandlerUserName = handlerName,
            CompletedAt = s.CompletedAt,
            IsLocked = s.IsLocked,
            CurrentStepIndex = step?.StepIndex ?? 0,
            TotalSteps = totalSteps,
            CurrentStepName = step?.StepName ?? string.Empty,
            ActionState = actionState,
            StepsProgress = stepsProgress ?? new(),
            LastComment = lastComment,
            CurrentAssigneeName = currentAssigneeName ?? handlerName
        };
    }

    private static string ComputeInitials(string fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return "؟";
        var parts = fullName.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length >= 2)
        {
            return $"{parts[0][0]}.{parts[1][0]}";
        }
        return parts[0].Length >= 2 ? parts[0].Substring(0, 2) : parts[0];
    }

    private static HashSet<int> GetStepCandidateApprovers(
        FormSubmission? s,
        RuntimeStep? step,
        List<WorkflowHistory>? subHistories,
        Dictionary<int, HashSet<int>>? groupMembersMap)
    {
        var approverIds = new HashSet<int>();

        if (step != null && step.Approvers != null)
        {
            foreach (var a in step.Approvers)
            {
                if (a == null) continue;
                if ("User".Equals(a.Type, StringComparison.OrdinalIgnoreCase))
                {
                    approverIds.Add(a.Id);
                }
                else if ("Group".Equals(a.Type, StringComparison.OrdinalIgnoreCase))
                {
                    if (groupMembersMap != null && groupMembersMap.TryGetValue(a.Id, out var members) && members != null)
                    {
                        foreach (var uid in members) approverIds.Add(uid);
                    }
                }
            }
        }

        if (s != null && s.CurrentHandlerUserID.HasValue)
        {
            approverIds.Add(s.CurrentHandlerUserID.Value);
        }

        // اعمال واگذاری‌های این مرحله (Reassignments)
        if (subHistories != null)
        {
            var stepReassigns = subHistories
                .Where(h => h != null &&
                            (h.ActionTaken == "ReassignedByAdmin" || h.ActionTaken == "Refer") &&
                            !string.IsNullOrEmpty(h.Comments) &&
                            h.Comments.Contains("[Reassign:"))
                .ToList();

            foreach (var rh in stepReassigns)
            {
                var match = System.Text.RegularExpressions.Regex.Match(rh.Comments!, @"\[Reassign:(\d+)->(\d+)\]");
                if (match.Success && int.TryParse(match.Groups[1].Value, out var fromId) && int.TryParse(match.Groups[2].Value, out var toId))
                {
                    if (approverIds.Contains(fromId))
                    {
                        approverIds.Remove(fromId);
                        approverIds.Add(toId);
                    }
                }
            }
        }

        return approverIds;
    }

    private static List<int> GetPendingStepApprovers(
        FormSubmission? s,
        RuntimeStep? step,
        List<WorkflowHistory>? subHistories,
        Dictionary<int, HashSet<int>>? groupMembersMap)
    {
        var candidateIds = GetStepCandidateApprovers(s, step, subHistories, groupMembersMap);

        // ۱. حذف قطعی کاربر متقاضی طبق الزامات سیستم (هرگز متقاضی جزو مسئولین کارتابل نباشد)
        if (s?.SubmittedByUserID.HasValue == true)
        {
            candidateIds.Remove(s.SubmittedByUserID.Value);
        }

        // ۲. حذف کاربرانی که در این مرحله قبلاً تایید ثبت کرده‌اند
        if (subHistories != null && !string.IsNullOrWhiteSpace(s?.WorkflowStatus))
        {
            var approvedUserIdsInThisStep = subHistories
                .Where(h => h != null &&
                            (h.PreviousStatus == s.WorkflowStatus || h.NewStatus == s.WorkflowStatus) &&
                            (h.ActionTaken == "StepApproved_Single" || h.ActionTaken == "StepApprove" || h.ActionTaken == "Approve" || h.ActionTaken == "FinalApprove"))
                .Select(h => h.ActionByUserID)
                .ToHashSet();

            candidateIds.RemoveWhere(uid => approvedUserIdsInThisStep.Contains(uid));
        }

        return candidateIds.OrderBy(id => id).ToList();
    }

    private static List<WorkflowStepProgressDto> BuildStepsProgress(
        FormSubmission s,
        RuntimePolicy policy,
        List<WorkflowHistory> subHistory,
        Dictionary<int, List<AppUser>> groupMembersMap,
        Dictionary<int, AppUser> usersMap)
    {
        var result = new List<WorkflowStepProgressDto>();

        // اگر مراحلی در پالیسی وجود نداشت ولی درخواست دارای وضعیت گردش‌کار است، یک مرحله با اطلاعات موجود ایجاد می‌شود
        var stepsToProcess = new List<RuntimeStep>(policy.Steps ?? new List<RuntimeStep>());
        if (stepsToProcess.Count == 0 && !string.IsNullOrWhiteSpace(s.WorkflowStatus) && s.WorkflowStatus.StartsWith("PendingStep_"))
        {
            string stepTitle = s.WorkflowStatus.Contains(':') ? s.WorkflowStatus.Split(':')[1].Trim() : "بررسی و تایید";
            var synStep = new RuntimeStep
            {
                StepIndex = 0,
                StepName = stepTitle,
                ApprovalRule = "ALL"
            };
            if (s.CurrentHandlerUserID.HasValue)
            {
                synStep.Approvers.Add(new RuntimeApprover { Type = "User", Id = s.CurrentHandlerUserID.Value });
            }
            stepsToProcess.Add(synStep);
        }

        if (stepsToProcess.Count == 0) return result;

        var currStep = GetCurrentStepFromStatus(s.WorkflowStatus, stepsToProcess);
        int currentStepIndex = currStep?.StepIndex ?? s.CurrentStepIndex;

        bool isWorkflowCompleted = s.WorkflowStatus == "Approved" || s.WorkflowStatus == "Completed";
        bool isWorkflowRejected = s.WorkflowStatus == "Rejected";

        foreach (var step in stepsToProcess)
        {
            var stepProgress = new WorkflowStepProgressDto
            {
                StepIndex = step.StepIndex,
                StepName = step.StepName,
                ApprovalRule = step.ApprovalRule?.ToUpperInvariant() ?? "ALL"
            };

            // استخراج کاربران مسئول این مرحله
            var approverUsers = new Dictionary<int, (string Name, string Initials)>();

            foreach (var a in step.Approvers)
            {
                if (a.Type.Equals("User", StringComparison.OrdinalIgnoreCase))
                {
                    if (usersMap.TryGetValue(a.Id, out var u))
                    {
                        var displayName = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Username;
                        approverUsers[u.UserID] = (displayName, ComputeInitials(displayName));
                    }
                    else
                    {
                        approverUsers[a.Id] = ($"کاربر {a.Id}", a.Id.ToString());
                    }
                }
                else if (a.Type.Equals("Group", StringComparison.OrdinalIgnoreCase))
                {
                    if (groupMembersMap.TryGetValue(a.Id, out var members) && members.Count > 0)
                    {
                        foreach (var m in members)
                        {
                            var displayName = !string.IsNullOrWhiteSpace(m.DisplayName) ? m.DisplayName : m.Username;
                            approverUsers[m.UserID] = (displayName, ComputeInitials(displayName));
                        }
                    }
                    else
                    {
                        approverUsers[-a.Id] = ($"اعضای گروه {a.Id}", "گروه");
                    }
                }
            }

            // اگر درخواست مستقیماً به کاربری ارجاع شده است
            if (s.CurrentHandlerUserID.HasValue && !approverUsers.ContainsKey(s.CurrentHandlerUserID.Value))
            {
                var hUser = s.CurrentHandlerUser ?? (usersMap.TryGetValue(s.CurrentHandlerUserID.Value, out var hu) ? hu : null);
                var dName = hUser != null ? (!string.IsNullOrWhiteSpace(hUser.DisplayName) ? hUser.DisplayName : hUser.Username) : $"کاربر {s.CurrentHandlerUserID.Value}";
                approverUsers[s.CurrentHandlerUserID.Value] = (dName, ComputeInitials(dName));
            }

            // استخراج تاریخچه مربوط به این مرحله
            var stepHistories = subHistory.Where(h =>
                (h.PreviousStatus != null && h.PreviousStatus.StartsWith($"PendingStep_{step.StepIndex}")) ||
                (h.NewStatus != null && h.NewStatus.StartsWith($"PendingStep_{step.StepIndex}")) ||
                (h.PreviousStatus != null && h.PreviousStatus.Contains(step.StepName)) ||
                (step.StepIndex == stepsToProcess.Count - 1 && (h.ActionTaken == "FinalApprove" || h.ActionTaken == "StepApprove"))
            ).ToList();

            // اعمال واگذاری‌های این مرحله (Reassignments)
            var stepReassigns = stepHistories
                .Where(h => (h.ActionTaken == "ReassignedByAdmin" || h.ActionTaken == "Refer") &&
                            !string.IsNullOrEmpty(h.Comments) &&
                            h.Comments.Contains("[Reassign:"))
                .ToList();

            foreach (var rh in stepReassigns)
            {
                var match = System.Text.RegularExpressions.Regex.Match(rh.Comments!, @"\[Reassign:(\d+)->(\d+)\]");
                if (match.Success && int.TryParse(match.Groups[1].Value, out var fromId) && int.TryParse(match.Groups[2].Value, out var toId))
                {
                    approverUsers.Remove(fromId);
                    if (usersMap.TryGetValue(toId, out var tu))
                    {
                        var dName = !string.IsNullOrWhiteSpace(tu.DisplayName) ? tu.DisplayName : tu.Username;
                        approverUsers[toId] = (dName, ComputeInitials(dName));
                    }
                    else
                    {
                        approverUsers[toId] = ($"کاربر {toId}", toId.ToString());
                    }
                }
            }

            // حذف قطعی کاربر متقاضی طبق الزامات سیستم (هرگز متقاضی جزو مسئولین کارتابل نباشد)
            if (s.SubmittedByUserID.HasValue)
            {
                approverUsers.Remove(s.SubmittedByUserID.Value);
            }

            // افزودن کاربرانی که در تاریخچه این مرحله اقدام ثبت کرده‌اند
            foreach (var sh in stepHistories)
            {
                if (sh.ActionByUser != null && !approverUsers.ContainsKey(sh.ActionByUserID) && sh.ActionByUserID != s.SubmittedByUserID)
                {
                    var displayName = !string.IsNullOrWhiteSpace(sh.ActionByUser.DisplayName) ? sh.ActionByUser.DisplayName : sh.ActionByUser.Username;
                    approverUsers[sh.ActionByUserID] = (displayName, ComputeInitials(displayName));
                }
            }

            // تعیین وضعیت اقدام هر نفر
            int approvedCount = 0;
            bool hasStepRejection = false;

            foreach (var kvp in approverUsers)
            {
                int uId = kvp.Key;
                var info = kvp.Value;

                var approverStatus = new WorkflowStepApproverStatusDto
                {
                    UserId = uId,
                    FullName = info.Name,
                    Initials = info.Initials,
                    Status = "Pending"
                };

                // بررسی تاریخچه اقدامات
                var userAction = stepHistories.LastOrDefault(h => h.ActionByUserID == uId);
                if (userAction != null)
                {
                    if (userAction.ActionTaken == "StepApproved_Single" ||
                        userAction.ActionTaken == "StepApprove" ||
                        userAction.ActionTaken == "FinalApprove" ||
                        userAction.ActionTaken == "Approve" ||
                        userAction.ActionTaken == "Approved")
                    {
                        approverStatus.Status = "Approved";
                        approverStatus.ActionAt = userAction.ActionAt;
                        approvedCount++;
                    }
                    else if (userAction.ActionTaken == "Reject" || userAction.ActionTaken == "Rejected")
                    {
                        approverStatus.Status = "Rejected";
                        approverStatus.ActionAt = userAction.ActionAt;
                        hasStepRejection = true;
                    }
                }

                stepProgress.Approvers.Add(approverStatus);
            }

            // تعیین وضعیت کلی این مرحله
            if (isWorkflowRejected)
            {
                if (hasStepRejection || currentStepIndex == step.StepIndex)
                {
                    stepProgress.Status = "Rejected";
                }
                else if (currentStepIndex > step.StepIndex)
                {
                    stepProgress.Status = "Completed";
                }
                else
                {
                    stepProgress.Status = "Pending";
                }
            }
            else if (isWorkflowCompleted)
            {
                stepProgress.Status = "Completed";
            }
            else
            {
                if (s.WorkflowStatus.StartsWith($"PendingStep_{step.StepIndex}") || currentStepIndex == step.StepIndex)
                {
                    stepProgress.Status = "Active";
                }
                else if (currentStepIndex > step.StepIndex)
                {
                    stepProgress.Status = "Completed";
                }
                else
                {
                    stepProgress.Status = "Pending";
                }
            }

            // تعیین تعداد تاییدهای موردنیاز
            stepProgress.RequiredCount = stepProgress.ApprovalRule == "ANY" ? 1 : Math.Max(1, stepProgress.Approvers.Count);

            if (stepProgress.Status == "Completed")
            {
                stepProgress.ApprovedCount = stepProgress.RequiredCount;
            }
            else
            {
                stepProgress.ApprovedCount = approvedCount;
            }

            // ۱. تشخیص مراحل دارای پرش شرطی (Skipped)
            bool isActiveStep = !string.IsNullOrWhiteSpace(s.WorkflowStatus) && s.WorkflowStatus.StartsWith($"PendingStep_{step.StepIndex}");
            bool hasStepActions = approvedCount > 0 || hasStepRejection;
            bool conditionFailed = !EvaluateStepConditions(step, s.DataJSON ?? "{}");
            bool bypassedInWorkflow = !hasStepActions && (currentStepIndex > step.StepIndex || isWorkflowCompleted);

            if (!isActiveStep && !hasStepActions && (conditionFailed || bypassedInWorkflow))
            {
                stepProgress.Status = "Skipped";
                stepProgress.ApprovedCount = 0;
                stepProgress.RequiredCount = 0;
                foreach (var approver in stepProgress.Approvers)
                {
                    approver.Status = "Skipped";
                }
            }
            else
            {
                // ۲. وضعیت NotRequired (عدم نیاز به اقدام) برای اعضای باقیمانده در گام ANY یا مرحله بستهشده / رد شده
                bool isAnyCompleted = stepProgress.ApprovalRule == "ANY" && (stepProgress.Status == "Completed" || approvedCount >= 1);
                bool isStepRejected = stepProgress.Status == "Rejected";

                if (isAnyCompleted || isStepRejected)
                {
                    foreach (var a in stepProgress.Approvers)
                    {
                        if (a.Status == "Pending")
                        {
                            a.Status = "NotRequired";
                        }
                    }
                }
            }

            result.Add(stepProgress);
        }

        return result;
    }

    public async Task<List<WorkflowStepProgressDto>> GetStepsProgressAsync(long submissionId)
    {
        var s = await _context.FormSubmissions
            .Include(sub => sub.Form)
            .Include(sub => sub.SubmittedByUser)
            .Include(sub => sub.CurrentHandlerUser)
            .FirstOrDefaultAsync(sub => sub.SubmissionID == submissionId);

        if (s == null) return new List<WorkflowStepProgressDto>();

        var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
        var subHist = await _context.WorkflowHistory
            .Include(h => h.ActionByUser)
            .Where(h => h.SubmissionID == submissionId)
            .OrderBy(h => h.ActionAt)
            .ToListAsync();

        var allUsers = await _context.AppUsers.ToListAsync();
        var usersMap = allUsers.ToDictionary(u => u.UserID, u => u);

        var groupMembers = await _context.UserGroupMembers
            .Include(m => m.User)
            .ToListAsync();
        var groupMembersMap = groupMembers
            .GroupBy(m => m.GroupID)
            .ToDictionary(g => g.Key, g => g.Where(m => m.User != null).Select(m => m.User!).ToList());

        return BuildStepsProgress(s, policy, subHist, groupMembersMap, usersMap);
    }

    private async Task PopulateStepsProgressAsync(List<CartableItemDto> dtos, List<FormSubmission> submissions)
    {
        if (dtos.Count == 0 || submissions.Count == 0) return;

        var subMap = submissions.GroupBy(s => s.SubmissionID).ToDictionary(g => g.Key, g => g.First());
        var subIds = dtos.Select(d => d.SubmissionId).Distinct().ToList();

        var allHistories = await _context.WorkflowHistory
            .Include(h => h.ActionByUser)
            .Where(h => subIds.Contains(h.SubmissionID))
            .OrderBy(h => h.ActionAt)
            .ToListAsync();
        var historyBySub = allHistories.GroupBy(h => h.SubmissionID).ToDictionary(g => g.Key, g => g.ToList());

        var allUsers = await _context.AppUsers.ToListAsync();
        var usersMap = allUsers.ToDictionary(u => u.UserID, u => u);

        var groupMembers = await _context.UserGroupMembers
            .Include(m => m.User)
            .ToListAsync();
        var groupMembersMap = groupMembers
            .GroupBy(m => m.GroupID)
            .ToDictionary(g => g.Key, g => g.Where(m => m.User != null).Select(m => m.User!).ToList());

        foreach (var dto in dtos)
        {
            if (subMap.TryGetValue(dto.SubmissionId, out var s))
            {
                var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? dto.FormSchemaJson ?? "{}");
                var subHist = historyBySub.GetValueOrDefault(s.SubmissionID) ?? new List<WorkflowHistory>();
                dto.StepsProgress = BuildStepsProgress(s, policy, subHist, groupMembersMap, usersMap);

                // مقداردهی LastComment (آخرین کامنت تاریخچه درخواست)
                if (string.IsNullOrWhiteSpace(dto.LastComment))
                {
                    dto.LastComment = subHist
                        .Where(h => h != null && !string.IsNullOrWhiteSpace(h.Comments))
                        .OrderByDescending(h => h.ActionAt)
                        .Select(h => h.Comments)
                        .FirstOrDefault();
                }

                // مقداردهی CurrentAssigneeName (مسئولین فعلی مرحله جاری یا CurrentHandlerUserName)
                var activeStep = dto.StepsProgress?.FirstOrDefault(sp => sp.Status == "Active");
                var pendingApproverNames = activeStep?.Approvers
                    ?.Where(a => a.Status == "Pending")
                    ?.Select(a => a.FullName)
                    ?.Where(n => !string.IsNullOrWhiteSpace(n))
                    ?.Distinct()
                    ?.ToList();

                if (pendingApproverNames != null && pendingApproverNames.Count > 0)
                {
                    dto.CurrentAssigneeName = string.Join("، ", pendingApproverNames);
                }
                else if (!string.IsNullOrWhiteSpace(dto.CurrentHandlerUserName))
                {
                    dto.CurrentAssigneeName = dto.CurrentHandlerUserName;
                }
                else if (s.WorkflowStatus == "Approved" || s.WorkflowStatus == "Completed")
                {
                    dto.CurrentAssigneeName = "تکمیل شده";
                }
                else if (s.WorkflowStatus == "Rejected")
                {
                    dto.CurrentAssigneeName = "رد شده";
                }
                else
                {
                    dto.CurrentAssigneeName = dto.CurrentAssigneeName ?? "کارتابل مدیریت/سرپرستی";
                }
            }
        }
    }

    public async Task<List<AdminMonitoringTaskDto>> GetAdminMonitoringTasksAsync()
    {
        var pendingSubmissions = await _context.FormSubmissions
            .Include(s => s.Form)
            .Include(s => s.SubmittedByUser)
            .Include(s => s.CurrentHandlerUser)
            .Where(s => s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed")
            .OrderByDescending(s => s.SubmittedAt)
            .ToListAsync();

        if (pendingSubmissions.Count == 0) return new List<AdminMonitoringTaskDto>();

        var subIds = pendingSubmissions.Select(s => s.SubmissionID).ToList();
        var histories = await _context.WorkflowHistory
            .Where(h => subIds.Contains(h.SubmissionID))
            .OrderBy(h => h.ActionAt)
            .ToListAsync();
        var historyMap = histories.GroupBy(h => h.SubmissionID).ToDictionary(g => g.Key, g => g.ToList());

        var groupMembers = await _context.UserGroupMembers.ToListAsync();
        var groupMembersMap = groupMembers
            .GroupBy(m => m.GroupID)
            .ToDictionary(g => g.Key, g => g.Select(m => m.UserID).ToHashSet());

        var allUsers = await _context.AppUsers.ToListAsync();
        var usersMap = allUsers.ToDictionary(u => u.UserID, u => u);

        var tasks = new List<AdminMonitoringTaskDto>();

        foreach (var s in pendingSubmissions)
        {
            if (s == null) continue;
            var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
            var currentStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy?.Steps);
            var subHist = historyMap.GetValueOrDefault(s.SubmissionID) ?? new List<WorkflowHistory>();

            var pendingApprovers = GetPendingStepApprovers(s, currentStep, subHist, groupMembersMap);

            string submitterName = s.SubmittedByUser != null
                ? (!string.IsNullOrWhiteSpace(s.SubmittedByUser.DisplayName) ? s.SubmittedByUser.DisplayName : s.SubmittedByUser.Username)
                : "ناشناس";

            // تفکیک ردیف‌ها به ازای هر کارتابل فعال (۱ ردیف = ۱ وظیفه کارتابل فردی)
            if (pendingApprovers != null && pendingApprovers.Count > 0)
            {
                foreach (var uid in pendingApprovers)
                {
                    var u = usersMap.GetValueOrDefault(uid);
                    string uName = u != null
                        ? (!string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Username)
                        : $"کاربر {uid}";

                    tasks.Add(new AdminMonitoringTaskDto
                    {
                        SubmissionId = s.SubmissionID,
                        TrackingCode = s.TrackingCode ?? string.Empty,
                        FormId = s.FormID,
                        FormTitle = s.Form?.Title ?? "بدون عنوان",
                        WorkflowStatus = s.WorkflowStatus ?? string.Empty,
                        SubmittedByName = submitterName,
                        SubmittedAt = s.SubmittedAt,
                        CurrentHandlerUserId = uid,
                        CurrentHandlerName = uName,
                        CurrentAssignees = new List<string> { uName }
                    });
                }
            }
            else
            {
                // در صورتی که کاربری به عنوان ناظر مستقیم تعیین شده باشد (بدون تاییدیه و غیر از متقاضی)
                if (s.CurrentHandlerUserID.HasValue && s.CurrentHandlerUserID.Value != s.SubmittedByUserID)
                {
                    var hu = usersMap.GetValueOrDefault(s.CurrentHandlerUserID.Value);
                    string hName = hu != null
                        ? (!string.IsNullOrWhiteSpace(hu.DisplayName) ? hu.DisplayName : hu.Username)
                        : $"کاربر {s.CurrentHandlerUserID.Value}";

                    tasks.Add(new AdminMonitoringTaskDto
                    {
                        SubmissionId = s.SubmissionID,
                        TrackingCode = s.TrackingCode ?? string.Empty,
                        FormId = s.FormID,
                        FormTitle = s.Form?.Title ?? "بدون عنوان",
                        WorkflowStatus = s.WorkflowStatus ?? string.Empty,
                        SubmittedByName = submitterName,
                        SubmittedAt = s.SubmittedAt,
                        CurrentHandlerUserId = s.CurrentHandlerUserID.Value,
                        CurrentHandlerName = hName,
                        CurrentAssignees = new List<string> { hName }
                    });
                }
            }
        }

        return tasks;
    }

    public Task<List<AdminMonitoringTaskDto>> GetAllActiveSubmissionsAsync() => GetAdminMonitoringTasksAsync();

    public async Task<bool> ReassignIndividualTaskAsync(long submissionId, int? fromUserId, int newUserId, string? comment, int adminUserId)
    {
        var sub = await _context.FormSubmissions.FindAsync(submissionId);
        if (sub == null) return false;

        var newUser = await _context.AppUsers.FindAsync(newUserId);
        if (newUser == null) return false;

        AppUser? fromUser = fromUserId.HasValue ? await _context.AppUsers.FindAsync(fromUserId.Value) : null;
        string fromName = fromUser != null
            ? (!string.IsNullOrWhiteSpace(fromUser.DisplayName) ? fromUser.DisplayName : fromUser.Username)
            : (fromUserId.HasValue ? $"کاربر {fromUserId.Value}" : "مسئول قبلی");
        string newName = !string.IsNullOrWhiteSpace(newUser.DisplayName) ? newUser.DisplayName : newUser.Username;

        if (!fromUserId.HasValue || sub.CurrentHandlerUserID == fromUserId.Value)
        {
            sub.CurrentHandlerUserID = newUserId;
        }

        string tag = fromUserId.HasValue ? $"[Reassign:{fromUserId.Value}->{newUserId}] " : "";

        _context.WorkflowHistory.Add(new WorkflowHistory
        {
            SubmissionID = submissionId,
            ActionTaken = "ReassignedByAdmin",
            PreviousStatus = sub.WorkflowStatus,
            NewStatus = sub.WorkflowStatus,
            Comments = $"{tag}واگذاری سهم کارتابل از {fromName} به {newName}: {comment ?? "واگذاری توسط مدیر سیستم"}".Trim(),
            ActionByUserID = adminUserId,
            ActionAt = DateTime.UtcNow
        });

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<int> BulkReassignUserTasksAsync(int fromUserId, int toUserId, int adminUserId)
    {
        var toUser = await _context.AppUsers.FindAsync(toUserId);
        if (toUser == null) return 0;
        var fromUser = await _context.AppUsers.FindAsync(fromUserId);
        string fromName = fromUser != null ? (!string.IsNullOrWhiteSpace(fromUser.DisplayName) ? fromUser.DisplayName : fromUser.Username) : $"کاربر {fromUserId}";
        string toName = !string.IsNullOrWhiteSpace(toUser.DisplayName) ? toUser.DisplayName : toUser.Username;

        var openSubmissions = await _context.FormSubmissions
            .Include(s => s.Form)
            .Where(s => s.WorkflowStatus != "Approved" && s.WorkflowStatus != "Rejected" && s.WorkflowStatus != "Completed")
            .ToListAsync();

        if (openSubmissions.Count == 0) return 0;

        var subIds = openSubmissions.Select(s => s.SubmissionID).ToList();
        var histories = await _context.WorkflowHistory
            .Where(h => subIds.Contains(h.SubmissionID))
            .OrderBy(h => h.ActionAt)
            .ToListAsync();
        var historyMap = histories.GroupBy(h => h.SubmissionID).ToDictionary(g => g.Key, g => g.ToList());

        var groupMembers = await _context.UserGroupMembers.ToListAsync();
        var groupMembersMap = groupMembers
            .GroupBy(m => m.GroupID)
            .ToDictionary(g => g.Key, g => g.Select(m => m.UserID).ToHashSet());

        int count = 0;

        foreach (var s in openSubmissions)
        {
            var subHist = historyMap.GetValueOrDefault(s.SubmissionID) ?? new List<WorkflowHistory>();
            var policy = ExtractWorkflowPolicy(s.Form?.SchemaJSON ?? "{}");
            var currentStep = GetCurrentStepFromStatus(s.WorkflowStatus, policy.Steps);
            var pendingApprovers = GetPendingStepApprovers(s, currentStep, subHist, groupMembersMap);

            if (pendingApprovers.Contains(fromUserId))
            {
                if (s.CurrentHandlerUserID == fromUserId)
                {
                    s.CurrentHandlerUserID = toUserId;
                }

                _context.WorkflowHistory.Add(new WorkflowHistory
                {
                    SubmissionID = s.SubmissionID,
                    ActionTaken = "ReassignedByAdmin",
                    PreviousStatus = s.WorkflowStatus,
                    NewStatus = s.WorkflowStatus,
                    Comments = $"[Reassign:{fromUserId}->{toUserId}] واگذاری کلی وظایف از {fromName} به {toName}",
                    ActionByUserID = adminUserId,
                    ActionAt = DateTime.UtcNow
                });
                count++;
            }
        }

        await _context.SaveChangesAsync();
        return count;
    }

    #endregion
}