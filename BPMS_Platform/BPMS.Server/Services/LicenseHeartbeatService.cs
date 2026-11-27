using BPMS.Server.Services;

namespace BPMS.Server.Services;

public class LicenseHeartbeatService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<LicenseHeartbeatService> _logger;

    public LicenseHeartbeatService(IServiceProvider serviceProvider, ILogger<LicenseHeartbeatService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial delay after startup
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var licenseService = scope.ServiceProvider.GetRequiredService<ILicenseService>();
                await licenseService.RecordActivityAsync();
            }
            catch (Exception ex)
            {
                _logger.LogTrace(ex, "License heartbeat tracking error");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}
