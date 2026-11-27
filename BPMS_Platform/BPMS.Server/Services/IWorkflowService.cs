using BPMS.Server.DTOs;

namespace BPMS.Server.Services;

public interface IWorkflowService
{
    Task<CartableItemDto> SubmitFormAsync(SubmitFormDto dto, int currentUserId);
    Task<IEnumerable<CartableItemDto>> GetInboxAsync(int currentUserId);
    Task<IEnumerable<CartableItemDto>> GetOutboxAsync(int currentUserId);
    Task<IEnumerable<CartableItemDto>> GetCcItemsAsync(int currentUserId);
    Task<CartableItemDto?> GetSubmissionDetailsAsync(long submissionId, int currentUserId);
    Task<bool> ProcessTransitionAsync(long submissionId, TransitionTaskDto dto, int currentUserId);
    Task<IEnumerable<WorkflowHistoryItemDto>> GetSubmissionHistoryAsync(long submissionId);
    Task<List<WorkflowStepProgressDto>> GetStepsProgressAsync(long submissionId);
    Task<List<AdminMonitoringTaskDto>> GetAdminMonitoringTasksAsync();
    Task<List<AdminMonitoringTaskDto>> GetAllActiveSubmissionsAsync();
    Task<bool> ReassignIndividualTaskAsync(long submissionId, int? fromUserId, int newUserId, string? comment, int adminUserId);
    Task<int> BulkReassignUserTasksAsync(int fromUserId, int toUserId, int adminUserId);
    Task<bool> SetDelegationAsync(int fromUserId, DelegationDto dto);
    Task<DelegationDto?> GetActiveDelegationAsync(int userId);
    Task<bool> CancelDelegationAsync(int fromUserId);
}