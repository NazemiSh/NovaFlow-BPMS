using BPMS.Server.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Controllers;

/// <summary>
/// Controller for health check endpoints
/// </summary>
[ApiController]
[Route("[controller]")]
public class HealthController : ControllerBase
{
    private readonly ILogger<HealthController> _logger;
    private readonly ApplicationDbContext _context;

    public HealthController(ILogger<HealthController> logger, ApplicationDbContext context)
    {
        _logger = logger;
        _context = context;
    }

    /// <summary>
    /// Health check endpoint to verify the API and database connectivity
    /// </summary>
    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> Get()
    {
        var databaseConnected = false;
        try
        {
            databaseConnected = await _context.Database.CanConnectAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database connectivity check failed.");
        }

        return Ok(new
        {
            Status = "Healthy",
            Message = "BPMS Server is running",
            DatabaseConnected = databaseConnected,
            Timestamp = DateTime.UtcNow
        });
    }
}

