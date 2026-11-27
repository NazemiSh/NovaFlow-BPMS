namespace BPMS.Server.Services;

public class MasterDataSyncHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<MasterDataSyncHostedService> _logger;

    public MasterDataSyncHostedService(IServiceProvider serviceProvider, ILogger<MasterDataSyncHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MasterDataSyncHostedService started.");

        // Initial delay to let the app fully initialize
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var masterDataService = scope.ServiceProvider.GetRequiredService<IMasterDataService>();
                await masterDataService.CheckAndRunScheduledSyncsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in MasterDataSyncHostedService loop.");
            }

            // Check every 60 seconds
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("MasterDataSyncHostedService stopped.");
    }
}
