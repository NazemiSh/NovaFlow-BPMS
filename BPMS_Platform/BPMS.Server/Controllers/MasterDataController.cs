using System.Text.Json;
using BPMS.Server.DTOs;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BPMS.Server.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MasterDataController : ControllerBase
{
    private readonly IMasterDataService _masterDataService;
    private readonly ILogger<MasterDataController> _logger;

    public MasterDataController(IMasterDataService masterDataService, ILogger<MasterDataController> logger)
    {
        _masterDataService = masterDataService;
        _logger = logger;
    }

    #region Connections

    [HttpGet("connections")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetConnections()
    {
        var list = await _masterDataService.GetConnectionsAsync();
        return Ok(list);
    }

    [HttpGet("connections/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetConnection(int id)
    {
        try
        {
            var item = await _masterDataService.GetConnectionByIdAsync(id);
            return Ok(item);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("connections")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateConnection([FromBody] ConnectionDto dto)
    {
        bool isWindows = string.Equals(dto.AuthType, "Windows", StringComparison.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.ServerAddress) ||
            string.IsNullOrWhiteSpace(dto.DatabaseName) || (!isWindows && string.IsNullOrWhiteSpace(dto.Username)))
        {
            return BadRequest(new { message = isWindows
                ? "فیلدهای مشخصات اتصال (نام، آدرس سرور و نام دیتابیس) الزامی هستند."
                : "تمامی فیلدهای مشخصات اتصال (نام، آدرس سرور، نام دیتابیس و نام کاربری) الزامی هستند." });
        }

        var result = await _masterDataService.CreateConnectionAsync(dto);
        return Ok(result);
    }

    [HttpPut("connections/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateConnection(int id, [FromBody] ConnectionDto dto)
    {
        bool isWindows = string.Equals(dto.AuthType, "Windows", StringComparison.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.ServerAddress) ||
            string.IsNullOrWhiteSpace(dto.DatabaseName) || (!isWindows && string.IsNullOrWhiteSpace(dto.Username)))
        {
            return BadRequest(new { message = isWindows
                ? "فیلدهای مشخصات اتصال (نام، آدرس سرور و نام دیتابیس) الزامی هستند."
                : "تمامی فیلدهای مشخصات اتصال (نام، آدرس سرور، نام دیتابیس و نام کاربری) الزامی هستند." });
        }

        try
        {
            var result = await _masterDataService.UpdateConnectionAsync(id, dto);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpDelete("connections/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteConnection(int id)
    {
        try
        {
            await _masterDataService.DeleteConnectionAsync(id);
            return Ok(new { message = "اتصال با موفقیت حذف گردید." });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("connections/test")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> TestConnection([FromBody] ConnectionTestRequestDto dto)
    {
        var result = await _masterDataService.TestConnectionAsync(dto);
        return Ok(result);
    }

    [HttpPost("connections/preview-full")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ConnectionPreviewFull([FromBody] PreviewSqlFullRequestDto dto)
    {
        var result = await _masterDataService.PreviewSqlFullAsync(dto);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }
        return Ok(result);
    }

    #endregion

    #region Tables Management

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables()
    {
        var list = await _masterDataService.GetTablesAsync();
        return Ok(list);
    }

    [HttpGet("tables/{id}")]
    public async Task<IActionResult> GetTable(int id)
    {
        try
        {
            var item = await _masterDataService.GetTableByIdAsync(id);
            return Ok(item);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("tables")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateTable([FromBody] TableCreateUpdateDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Code) || string.IsNullOrWhiteSpace(dto.Title))
        {
            return BadRequest(new { message = "کد لاتین و عنوان جدول الزامی است." });
        }

        if (dto.Columns == null || dto.Columns.Count == 0)
        {
            return BadRequest(new { message = "تعریف حداقل یک ستون برای جدول الزامی است." });
        }

        try
        {
            var result = await _masterDataService.CreateTableAsync(dto);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("tables/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateTable(int id, [FromBody] TableCreateUpdateDto dto)
    {
        try
        {
            var result = await _masterDataService.UpdateTableAsync(id, dto);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("tables/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteTable(int id)
    {
        try
        {
            await _masterDataService.DeleteTableAsync(id);
            return Ok(new { message = "جدول مرجع با موفقیت حذف گردید." });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpPost("tables/preview-sql")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> PreviewSql([FromBody] PreviewSqlRequestDto dto)
    {
        var result = await _masterDataService.PreviewSqlSchemaAsync(dto);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }
        return Ok(result);
    }

    [HttpPost("tables/preview-full")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> TablePreviewFull([FromBody] PreviewSqlFullRequestDto dto)
    {
        var result = await _masterDataService.PreviewSqlFullAsync(dto);
        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }
        return Ok(result);
    }

    [HttpPost("tables/{id}/sync")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SyncTable(int id)
    {
        try
        {
            var result = await _masterDataService.SyncTableAsync(id);
            return Ok(new
            {
                message = $"✅ همگام‌سازی با موفقیت انجام شد. تعداد رکوردهای فعال: {result.RecordCount}",
                table = result
            });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"خطا در همگام‌سازی: {ex.Message}" });
        }
    }

    [HttpPost("excel/preview")]
    [Authorize(Roles = "Admin")]
    public IActionResult PreviewExcel([FromForm] IFormFile? file, [FromForm] string? sheetName = null)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "فایل اکسل یا CSV انتخاب نشده است." });
        }

        try
        {
            using var stream = file.OpenReadStream();
            var result = ExcelCsvHelper.BuildPreview(stream, file.FileName, sheetName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"خطا در خواندن فایل: {ex.Message}" });
        }
    }

    [HttpPost("tables/{id}/import")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ImportData(
        int id,
        [FromForm] IFormFile? file,
        [FromForm] string? sheetName = null,
        [FromForm] string? columnMappingsJson = null)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "فایل انتخاب نشده است." });
        }

        List<ExcelColumnMappingDto>? mappings = null;
        if (!string.IsNullOrWhiteSpace(columnMappingsJson))
        {
            try
            {
                mappings = JsonSerializer.Deserialize<List<ExcelColumnMappingDto>>(
                    columnMappingsJson,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                return BadRequest(new { message = "ساختار نگاشت ستون‌ها نامعتبر است." });
            }
        }

        try
        {
            using var stream = file.OpenReadStream();
            var result = await _masterDataService.ImportDataAsync(id, stream, file.FileName, sheetName, mappings);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"خطا در ایمپورت داده‌ها: {ex.Message}" });
        }
    }

    [HttpGet("tables/{id}/sample-template")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DownloadSampleTemplate(int id)
    {
        try
        {
            var table = await _masterDataService.GetTableByIdAsync(id);
            var bytes = ExcelCsvHelper.GenerateSampleCsvTemplate(table.Columns, table.UniqueKeyColumn);
            return File(bytes, "text/csv; charset=utf-8", $"Template_{table.Code}.csv");
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    #endregion

    #region Records & Fast Consumption

    [HttpGet("tables/{id}/records")]
    public async Task<IActionResult> GetTableRecords(int id, [FromQuery] string? version)
    {
        try
        {
            var result = await _masterDataService.GetTableRecordsAsync(id, version);
            return Ok(result);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { message = ex.Message });
        }
    }

    [HttpGet("tables/{id}/lookup")]
    public async Task<IActionResult> LookupRecords(int id, [FromQuery] string? query, [FromQuery] int limit = 20)
    {
        var records = await _masterDataService.LookupRecordsAsync(id, query, limit);
        return Ok(records);
    }

    [HttpGet("tables/{id}/records/manage")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ManageRecords(int id, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, [FromQuery] string? search = null)
    {
        var (items, total) = await _masterDataService.GetManageRecordsAsync(id, Math.Max(1, page), Math.Clamp(pageSize, 10, 200), search);
        return Ok(new { items, total, page, pageSize });
    }

    [HttpPost("tables/{id}/records")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> AddRecord(int id, [FromBody] RecordCreateUpdateDto dto)
    {
        try
        {
            var result = await _masterDataService.AddRecordAsync(id, dto);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("tables/{id}/records/{recordId}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateRecord(int id, long recordId, [FromBody] RecordCreateUpdateDto dto)
    {
        try
        {
            var result = await _masterDataService.UpdateRecordAsync(id, recordId, dto);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpDelete("tables/{id}/records/{recordId}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ToggleRecordStatus(int id, long recordId)
    {
        try
        {
            await _masterDataService.ToggleRecordStatusAsync(id, recordId);
            return Ok(new { message = "وضعیت رکورد با موفقیت تغییر کرد." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    #endregion
}
