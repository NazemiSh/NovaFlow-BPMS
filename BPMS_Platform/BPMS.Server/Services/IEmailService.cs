namespace BPMS.Server.Services;

public interface IEmailService
{
    bool IsValidRecipientEmail(string? email, string? username = null);
    Task<bool> SendEmailAsync(IEnumerable<string> toEmails, string subject, string body, bool isHtml = false);
    Task NotifyWorkflowTaskAssignedAsync(long submissionId, string stepName, string? portalUrl = null);
    void EnqueueWorkflowTaskAssigned(long submissionId, string stepName, string? portalUrl = null);
    Task NotifyAdminsOfPendingFormAsync(int formId, int submitterUserId, string? portalUrl = null);
    void EnqueueNotifyAdminsOfPendingForm(int formId, int submitterUserId, string? portalUrl = null);
}
