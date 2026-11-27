using System.Text.Json.Serialization;

namespace BPMS.Server.DTOs;

public class SubmitFormDto
{
    public int FormId { get; set; }
    public string FormDataJson { get; set; } = string.Empty;
    public int? AssignToUserId { get; set; }
    public string? Comment { get; set; }
    public List<int>? CcUserIds { get; set; }
    public List<int>? CcGroupIds { get; set; }
    public string? CaptchaToken { get; set; }
    public string? CaptchaAnswer { get; set; }
    public string? Honeypot { get; set; }
}

public class TransitionTaskDto
{
    public string Action { get; set; } = string.Empty; // Approve, Reject, Refer
    public string? Comment { get; set; }
    public int? ReferToUserId { get; set; }
}

public class WorkflowStepApproverStatusDto
{
    public int UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Initials { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending"; // "Approved" | "Rejected" | "Pending" | "NotRequired" | "Skipped"
    public DateTime? ActionAt { get; set; }
}

public class WorkflowStepProgressDto
{
    public int StepIndex { get; set; }
    public string StepName { get; set; } = string.Empty;
    public string ApprovalRule { get; set; } = "ALL"; // "ALL" | "ANY"
    public string Status { get; set; } = "Pending"; // "Completed" | "Active" | "Pending" | "Rejected" | "Skipped"
    public int ApprovedCount { get; set; }
    public int RequiredCount { get; set; }
    public List<WorkflowStepApproverStatusDto> Approvers { get; set; } = new();
}

public class CartableItemDto
{
    public long SubmissionId { get; set; }

    [JsonIgnore]
    public long SubmissionID => SubmissionId;

    public int FormId { get; set; }
    public string FormTitle { get; set; } = string.Empty;
    public string TrackingCode { get; set; } = string.Empty;
    public string FormDataJson { get; set; } = string.Empty;
    public string? FormSchemaJson { get; set; }
    public string WorkflowStatus { get; set; } = string.Empty;
    public int? SubmittedByUserId { get; set; }
    public string SubmittedByUserName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public int? CurrentHandlerUserId { get; set; }
    public string? CurrentHandlerUserName { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsLocked { get; set; }
    public bool IsCc { get; set; } = false;
    public int CurrentStepIndex { get; set; } = 0;
    public int TotalSteps { get; set; } = 1;
    public string CurrentStepName { get; set; } = string.Empty;
    public string ActionState { get; set; } = "Pending"; // "Pending" | "Approved" | "Rejected"
    public string? LastComment { get; set; }
    public string? CurrentAssigneeName { get; set; }
    public List<WorkflowStepProgressDto> StepsProgress { get; set; } = new();
}

public class WorkflowHistoryItemDto
{
    public long HistoryId { get; set; }
    public long SubmissionId { get; set; }
    public string ActionTaken { get; set; } = string.Empty;
    public string? PreviousStatus { get; set; }
    public string NewStatus { get; set; } = string.Empty;
    public string? Comments { get; set; }
    public int ActionByUserId { get; set; }
    public string ActionByUserName { get; set; } = string.Empty;
    public DateTime ActionAt { get; set; }
    public string? StepName { get; set; }
    public int? StepIndex { get; set; }
}

public class AdminMonitoringTaskDto
{
    public long SubmissionId { get; set; }

    [JsonIgnore]
    public long SubmissionID => SubmissionId;

    public string TrackingCode { get; set; } = string.Empty;
    public int FormId { get; set; }
    public string FormTitle { get; set; } = string.Empty;
    public string WorkflowStatus { get; set; } = string.Empty;
    public string SubmittedByName { get; set; } = string.Empty;
    public DateTime SubmittedAt { get; set; }
    public int? CurrentHandlerUserId { get; set; }

    [JsonIgnore]
    public int? CurrentHandlerUserID => CurrentHandlerUserId;

    public string CurrentHandlerName { get; set; } = string.Empty;
    public List<string> CurrentAssignees { get; set; } = new();
}

public class DelegationDto
{
    public int ToUserId { get; set; }
    public string StartDate { get; set; } = string.Empty;
    public string EndDate { get; set; } = string.Empty;
}

public class WorkflowStepConfig
{
    public int StepIndex { get; set; }
    public string StepName { get; set; } = string.Empty;
    public string ApproverType { get; set; } = "Group"; // Group, User, Role
    public int ApproverId { get; set; } // GroupID or UserID
    public string ApprovalRule { get; set; } = "ANY"; // ANY (OR), ALL (AND)
    public string? ConditionField { get; set; }
    public string? ConditionOperator { get; set; } // >, <, ==, !=
    public string? ConditionValue { get; set; }
}

public class WorkflowPolicyConfig
{
    public List<WorkflowStepConfig> Steps { get; set; } = new();
    public List<int> DefaultCcUserIds { get; set; } = new();
    public List<int> DefaultCcGroupIds { get; set; } = new();
    public bool RequireAdminApprovalOnPublish { get; set; } = false;
}
