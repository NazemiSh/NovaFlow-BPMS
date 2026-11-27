using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.Models;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Controllers;

public class MultiFormQueryRequestDto
{
    public List<int> FormIds { get; set; } = new();
    public string UserPrompt { get; set; } = string.Empty;
}

public class AiProviderItemDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ProviderName { get; set; } = string.Empty;
    public string BaseUrl { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
    public string ModelName { get; set; } = "gpt-4o-mini";
    public double Temperature { get; set; } = 0.2;
    public int MaxTokens { get; set; } = 2000;
    public bool IsActive { get; set; } = false;
    public string? SystemPrompt { get; set; }
}

public class FetchModelsRequestDto
{
    public string BaseUrl { get; set; } = string.Empty;
    public string? ApiKey { get; set; }
}

[ApiController]
[Route("api/admin/ai")]
[Route("api/ai")]
[Authorize(Roles = "Admin,SuperUser")]
public class AdminAiController : ControllerBase
{
    private const string ProvidersSettingKey = "AI:ProvidersJson";
    public const string DefaultSystemPrompt = @"شما معمار ارشد پایگاه‌داده Microsoft SQL Server و متخصص هوش تجاری (BI) در سامانه فرم‌ساز سازمانی BPMS هستید.
وظیفه شما:
1. تحلیل دقیق اسکیمای فرم‌ها و نگارش‌های انتخابی (FormID و Version.Revision).
2. استخراج مقادیر فیلدهای ذخیره‌شده در ستون DataJSON جدول dbo.FormSubmissions با استفاده از تابع JSON_VALUE(DataJSON, '$.field_id').
3. برای فیلدهای جدول اقلام یا چندسطری (repeater_grid و table)، اقلام به صورت آرایه JSON در DataJSON ذخیره می‌شوند. جهت استخراج، گزارش‌گیری، فیلتر یا جمع‌بندی مقادیر اقلام (مانند SUM تعداد، مبالغ یا شمارش اقلام)، حتماً از ساختار CROSS APPLY OPENJSON(s.DataJSON, '$.field_id') WITH (...) استفاده فرمایید.
4. پیاده‌سازی اتصالات (JOIN)، تجمیع‌ها (Aggregations) و فیلترهای زمانی و سازمانی بین فرم‌های مختلف بر اساس نیازمندی کاربر.
5. تولید کوئری‌های بهینه T-SQL و ایجاد CREATE OR ALTER VIEW اختصاصی جهت ایمپورت مستقیم در Power BI.
6. ارائه توضیحات ساختاریافته، دقیق و روان به زبان فارسی پیرامون منطق کوئری و نحوه ارتباط جداول.";

    private readonly ApplicationDbContext _context;
    private readonly ILicenseService _licenseService;
    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly ILogger<AdminAiController> _logger;

    public AdminAiController(
        ApplicationDbContext context, 
        ILicenseService licenseService,
        ILogger<AdminAiController> logger,
        IHttpClientFactory? httpClientFactory = null)
    {
        _context = context;
        _licenseService = licenseService;
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    private async Task<bool> IsAiLicenseActiveAsync()
    {
        var license = await _licenseService.ValidateLicenseAsync();
        return license.IsValid && license.EnableAiModule;
    }

    private HttpClient CreateAiHttpClient(TimeSpan? timeout = null)
    {
        var handler = new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
        };
        var client = new HttpClient(handler);
        client.Timeout = timeout ?? TimeSpan.FromSeconds(30);
        return client;
    }

    private async Task<List<AiProviderItemDto>> GetProvidersListInternalAsync()
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == ProvidersSettingKey);
        List<AiProviderItemDto>? providers = null;

        if (setting != null && !string.IsNullOrWhiteSpace(setting.SettingValue))
        {
            try
            {
                providers = JsonSerializer.Deserialize<List<AiProviderItemDto>>(setting.SettingValue, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to deserialize AI:ProvidersJson");
            }
        }

        if (providers == null || providers.Count == 0)
        {
            // Migrate / initialize from existing AiConfigurations only if real config exists in database
            var existingConfig = await _context.AiConfigurations.FirstOrDefaultAsync();
            if (existingConfig != null && !string.IsNullOrWhiteSpace(existingConfig.BaseUrl))
            {
                providers = new List<AiProviderItemDto>
                {
                    new AiProviderItemDto
                    {
                        Id = Guid.NewGuid().ToString(),
                        ProviderName = string.IsNullOrWhiteSpace(existingConfig.Provider) ? "سرویس پیش‌فرض" : existingConfig.Provider,
                        BaseUrl = existingConfig.BaseUrl ?? "",
                        ApiKey = existingConfig.ApiKey,
                        ModelName = string.IsNullOrWhiteSpace(existingConfig.ModelName) ? "gpt-4o-mini" : existingConfig.ModelName,
                        Temperature = existingConfig.Temperature,
                        MaxTokens = existingConfig.MaxTokens > 0 ? existingConfig.MaxTokens : 2000,
                        IsActive = existingConfig.IsEnabled,
                        SystemPrompt = !string.IsNullOrWhiteSpace(existingConfig.SystemPrompt) ? existingConfig.SystemPrompt : DefaultSystemPrompt
                    }
                };
                await SaveProvidersListInternalAsync(providers);
            }
            else
            {
                // در نصب خام سامانه، لیست سرویس‌های هوش مصنوعی کاملاً خالی است
                providers = new List<AiProviderItemDto>();
            }
        }

        return providers;
    }

    private async Task SaveProvidersListInternalAsync(List<AiProviderItemDto> providers)
    {
        foreach (var p in providers)
        {
            if (string.IsNullOrWhiteSpace(p.Id))
                p.Id = Guid.NewGuid().ToString();
        }

        if (!providers.Any(p => p.IsActive) && providers.Count > 0)
        {
            providers[0].IsActive = true;
        }

        // 1. Save in SystemSettings
        var json = JsonSerializer.Serialize(providers, new JsonSerializerOptions { WriteIndented = true });
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == ProvidersSettingKey);
        if (setting == null)
        {
            setting = new SystemSetting
            {
                SettingKey = ProvidersSettingKey,
                SettingValue = json,
                UpdatedAt = DateTime.UtcNow
            };
            _context.SystemSettings.Add(setting);
        }
        else
        {
            setting.SettingValue = json;
            setting.UpdatedAt = DateTime.UtcNow;
        }

        // 2. Synchronize active provider to AiConfigurations table
        var active = providers.FirstOrDefault(p => p.IsActive);
        var config = await _context.AiConfigurations.FirstOrDefaultAsync();
        if (config == null)
        {
            config = new AiConfiguration();
            _context.AiConfigurations.Add(config);
        }

        if (active != null)
        {
            config.Provider = string.IsNullOrWhiteSpace(active.ProviderName) ? "OpenAI-Compatible" : active.ProviderName;
            config.BaseUrl = active.BaseUrl ?? "";
            config.ApiKey = active.ApiKey;
            config.ModelName = string.IsNullOrWhiteSpace(active.ModelName) ? "gpt-4o-mini" : active.ModelName;
            config.Temperature = active.Temperature;
            config.MaxTokens = active.MaxTokens > 0 ? active.MaxTokens : 2000;
            config.IsEnabled = active.IsActive;
            config.SystemPrompt = !string.IsNullOrWhiteSpace(active.SystemPrompt) ? active.SystemPrompt : DefaultSystemPrompt;
        }
        else
        {
            config.IsEnabled = false;
        }

        config.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }

    [HttpGet("providers")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetProviders()
    {
        var providers = await GetProvidersListInternalAsync();
        return Ok(providers);
    }

    [HttpPost("providers")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SaveProvider([FromBody] AiProviderItemDto dto)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });

        if (string.IsNullOrWhiteSpace(dto.ProviderName))
            return BadRequest(new { Message = "نام سرویس الزامی است." });

        if (string.IsNullOrWhiteSpace(dto.BaseUrl))
            return BadRequest(new { Message = "آدرس Base URL الزامی است." });

        var providers = await GetProvidersListInternalAsync();

        if (string.IsNullOrWhiteSpace(dto.Id))
        {
            dto.Id = Guid.NewGuid().ToString();
            if (dto.IsActive)
            {
                foreach (var p in providers) p.IsActive = false;
            }
            else if (providers.Count == 0)
            {
                dto.IsActive = true;
            }
            providers.Add(dto);
        }
        else
        {
            var existingIndex = providers.FindIndex(p => p.Id == dto.Id);
            if (existingIndex >= 0)
            {
                if (dto.IsActive)
                {
                    foreach (var p in providers) p.IsActive = false;
                }
                providers[existingIndex] = dto;
            }
            else
            {
                if (dto.IsActive)
                {
                    foreach (var p in providers) p.IsActive = false;
                }
                providers.Add(dto);
            }
        }

        // If no provider is active, make this or first active
        if (!providers.Any(p => p.IsActive) && providers.Count > 0)
        {
            providers[0].IsActive = true;
        }

        await SaveProvidersListInternalAsync(providers);
        return Ok(new { Message = "سرویس هوش مصنوعی با موفقیت ذخیره شد.", Providers = providers, Provider = dto });
    }

    [HttpPost("providers/set-active/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SetActiveProvider(string id)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });

        var providers = await GetProvidersListInternalAsync();
        var target = providers.FirstOrDefault(p => p.Id == id);
        if (target == null)
            return NotFound(new { Message = "سرویس مورد نظر یافت نشد." });

        foreach (var p in providers)
        {
            p.IsActive = (p.Id == id);
        }

        await SaveProvidersListInternalAsync(providers);
        return Ok(new { Message = "سرویس فعال با موفقیت تغییر کرد.", Providers = providers });
    }

    [HttpDelete("providers/{id}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteProvider(string id)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });

        var providers = await GetProvidersListInternalAsync();
        var target = providers.FirstOrDefault(p => p.Id == id);
        if (target == null)
            return NotFound(new { Message = "سرویس مورد نظر یافت نشد." });

        bool wasActive = target.IsActive;
        providers.Remove(target);

        if (wasActive && providers.Count > 0)
        {
            providers[0].IsActive = true;
        }

        await SaveProvidersListInternalAsync(providers);
        return Ok(new { Message = "سرویس با موفقیت حذف شد.", Providers = providers });
    }

    private static string CleanBaseUrl(string baseUrl)
    {
        var cleanUrl = (baseUrl ?? "").Trim().TrimEnd('/');
        if (cleanUrl.EndsWith("/chat/completions", StringComparison.OrdinalIgnoreCase))
            cleanUrl = cleanUrl[..^17].TrimEnd('/');
        else if (cleanUrl.EndsWith("/chat", StringComparison.OrdinalIgnoreCase))
            cleanUrl = cleanUrl[..^5].TrimEnd('/');
        return cleanUrl;
    }

    [HttpPost("fetch-models")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> FetchModels([FromBody] FetchModelsRequestDto dto)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });
        if (string.IsNullOrWhiteSpace(dto.BaseUrl))
            return BadRequest(new { Message = "آدرس Base URL الزامی است." });

        try
        {
            using var client = CreateAiHttpClient(TimeSpan.FromSeconds(25));

            var cleanUrl = CleanBaseUrl(dto.BaseUrl);

            var candidateUrls = new List<string>
            {
                cleanUrl + "/models"
            };

            if (!cleanUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
            {
                candidateUrls.Add(cleanUrl + "/v1/models");
                candidateUrls.Add(cleanUrl + "/api/tags"); // Ollama native
            }
            else
            {
                candidateUrls.Add(cleanUrl[..^3].TrimEnd('/') + "/models");
            }

            HttpResponseMessage? response = null;
            string responseString = string.Empty;
            string? lastError = null;

            var apiKey = string.IsNullOrWhiteSpace(dto.ApiKey) ? "none" : dto.ApiKey.Trim();

            foreach (var url in candidateUrls)
            {
                try
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get, url);
                    request.Headers.TryAddWithoutValidation("User-Agent", "OpenAI/Python 1.30.1");
                    request.Headers.TryAddWithoutValidation("Accept", "application/json");
                    request.Headers.TryAddWithoutValidation("HTTP-Referer", "http://localhost:5000");
                    request.Headers.TryAddWithoutValidation("X-Title", "BPMS AI Studio");
                    request.Headers.TryAddWithoutValidation("Authorization", "Bearer " + apiKey);

                    var res = await client.SendAsync(request);
                    if (res.IsSuccessStatusCode)
                    {
                        response = res;
                        responseString = await res.Content.ReadAsStringAsync();
                        break;
                    }
                    else
                    {
                        var errBody = await res.Content.ReadAsStringAsync();
                        lastError = $"آدرس {url} -> وضعیت {(int)res.StatusCode}: {errBody[..Math.Min(200, errBody.Length)]}";
                    }
                }
                catch (Exception ex)
                {
                    lastError = ex.InnerException != null ? $"{ex.Message} -> {ex.InnerException.Message}" : ex.Message;
                }
            }

            if (response == null || !response.IsSuccessStatusCode)
            {
                return StatusCode(400, new
                {
                    Message = $"امکان دریافت مدل‌ها از آدرس واردشده وجود ندارد. لطفا صحت Base URL و API Key را بررسی کنید. جزئیات: {lastError}"
                });
            }

            var modelsList = new List<string>();
            try 
            {
                using var doc = JsonDocument.Parse(responseString);
                var root = doc.RootElement;

            if (root.TryGetProperty("data", out var dataProp) && dataProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in dataProp.EnumerateArray())
                {
                    if (item.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                    {
                        var id = idProp.GetString();
                        if (!string.IsNullOrWhiteSpace(id)) modelsList.Add(id);
                    }
                    else if (item.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String)
                    {
                        var name = nameProp.GetString();
                        if (!string.IsNullOrWhiteSpace(name)) modelsList.Add(name);
                    }
                }
            }
            else if (root.TryGetProperty("models", out var modelsProp) && modelsProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in modelsProp.EnumerateArray())
                {
                    if (item.TryGetProperty("name", out var nameProp) && nameProp.ValueKind == JsonValueKind.String)
                    {
                        var name = nameProp.GetString();
                        if (!string.IsNullOrWhiteSpace(name)) modelsList.Add(name);
                    }
                    else if (item.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String)
                    {
                        var id = idProp.GetString();
                        if (!string.IsNullOrWhiteSpace(id)) modelsList.Add(id);
                    }
                }
            }
            else if (root.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in root.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String)
                    {
                        var str = item.GetString();
                        if (!string.IsNullOrWhiteSpace(str)) modelsList.Add(str);
                    }
                    else if (item.TryGetProperty("id", out var idProp))
                    {
                        var id = idProp.GetString();
                        if (!string.IsNullOrWhiteSpace(id)) modelsList.Add(id);
                    }
                }
            }

            }
            catch (JsonException)
            {
                return StatusCode(500, new { Message = "پاسخ دریافتی از سرور هوش مصنوعی در قالب JSON استاندارد نیست. لطفا آدرس Base URL را بررسی کنید." });
            }

            var distinctModels = modelsList.Distinct().OrderBy(m => m).ToList();
            return Ok(distinctModels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fetch models failed");
            return StatusCode(500, new { Message = "خطا در ارتباط با سرور هوش مصنوعی برای دریافت مدل‌ها: " + ex.Message });
        }
    }

    [HttpGet("config")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetConfig()
    {
        var config = await _context.AiConfigurations.FirstOrDefaultAsync();
        if (config == null || string.IsNullOrWhiteSpace(config.BaseUrl))
        {
            return Ok(new
            {
                isEnabled = false,
                provider = "",
                baseUrl = "",
                apiKey = "",
                modelName = "",
                temperature = 0.2,
                maxTokens = 2000,
                systemPrompt = DefaultSystemPrompt
            });
        }
        return Ok(config);
    }

    [HttpPost("config")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> SaveConfig([FromBody] AiConfiguration dto)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });

        var config = await _context.AiConfigurations.FirstOrDefaultAsync();
        if (config == null)
        {
            _context.AiConfigurations.Add(dto);
        }
        else
        {
            config.Provider = dto.Provider;
            config.BaseUrl = dto.BaseUrl;
            config.ApiKey = dto.ApiKey;
            config.ModelName = dto.ModelName;
            config.Temperature = dto.Temperature;
            config.MaxTokens = dto.MaxTokens;
            config.IsEnabled = dto.IsEnabled;
            config.SystemPrompt = dto.SystemPrompt;
            config.UpdatedAt = DateTime.UtcNow;
        }
        await _context.SaveChangesAsync();

        // Also update providers list in SystemSettings if exists
        try
        {
            var providers = await GetProvidersListInternalAsync();
            var active = providers.FirstOrDefault(p => p.IsActive) ?? providers.FirstOrDefault();
            if (active != null)
            {
                active.ProviderName = dto.Provider;
                active.BaseUrl = dto.BaseUrl;
                active.ApiKey = dto.ApiKey;
                active.ModelName = dto.ModelName;
                active.Temperature = dto.Temperature;
                active.MaxTokens = dto.MaxTokens;
                active.IsActive = dto.IsEnabled;
                await SaveProvidersListInternalAsync(providers);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to sync SaveConfig to AI:ProvidersJson");
        }

        return Ok(new { Message = "تنظیمات هوش مصنوعی با موفقیت ذخیره شد." });
    }

    [HttpPost("generate-multi-form-query")]
    public async Task<IActionResult> GenerateMultiFormQuery([FromBody] MultiFormQueryRequestDto dto)
    {
        if (!await IsAiLicenseActiveAsync())
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است." });
        if (dto.FormIds == null || dto.FormIds.Count == 0)
            return BadRequest(new { Message = "حداقل یک یا چند فرم برای تحلیل انتخاب کنید." });

        if (string.IsNullOrWhiteSpace(dto.UserPrompt))
            return BadRequest(new { Message = "متن درخواست یا فیلترهای مورد نظر را وارد کنید." });

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
        int currentUserId = userIdClaim != null && int.TryParse(userIdClaim.Value, out var uid) ? uid : 0;
        var isAdmin = User.IsInRole("Admin") || User.Claims.Any(c => (c.Type == ClaimTypes.Role || c.Type == "role") && c.Value == "Admin");

        if (!isAdmin)
        {
            var userSharedFormKeys = await _context.FormDefinitionShares
                .Where(s => s.SharedWithUserId == currentUserId && s.CanViewReports)
                .Select(s => s.FormKey)
                .ToListAsync();

            var userSharedFormIds = await _context.FormDefinitionShares
                .Where(s => s.SharedWithUserId == currentUserId && s.CanViewReports && s.FormId.HasValue)
                .Select(s => s.FormId!.Value)
                .ToListAsync();

            var inaccessibleForms = await _context.Forms
                .Where(f => dto.FormIds.Contains(f.FormID))
                .Where(f => f.CreatedByUserID != currentUserId && !userSharedFormKeys.Contains(f.FormCode) && !userSharedFormIds.Contains(f.FormID))
                .Select(f => f.Title)
                .ToListAsync();

            if (inaccessibleForms.Count > 0)
            {
                return StatusCode(StatusCodes.Status403Forbidden, new
                {
                    Message = $"شما به تحلیل و گزارش فرم‌های زیر دسترسی ندارید: {string.Join("، ", inaccessibleForms)}"
                });
            }
        }

        var config = await _context.AiConfigurations.FirstOrDefaultAsync(c => c.IsEnabled);
        if (config == null || string.IsNullOrWhiteSpace(config.BaseUrl))
            return BadRequest(new { Message = "سرویس هوش مصنوعی فعال نیست یا آدرس Base URL تنظیم نشده است." });

        var forms = await _context.Forms
            .Where(f => dto.FormIds.Contains(f.FormID))
            .Select(f => new { f.FormID, f.Title, f.Version, f.Revision, f.SchemaJSON })
            .ToListAsync();

        var schemaDescriptions = new StringBuilder();
        void AppendQuestionSchema(JsonElement q, string formTitle, int formId, string versionStr)
        {
            var qId = q.TryGetProperty("id", out var ip) ? ip.GetString() : (q.TryGetProperty("name", out var np) ? np.GetString() : "");
            var qLabel = q.TryGetProperty("label", out var lp) ? lp.GetString() : (q.TryGetProperty("title", out var tp) ? tp.GetString() : qId);
            var qType = q.TryGetProperty("type", out var typ) ? typ.GetString() : "text";

            if ((qType == "repeater_grid" || qType == "table") && q.TryGetProperty("columns", out var colsProp) && colsProp.ValueKind == JsonValueKind.Array)
            {
                var colInfoList = new List<string>();
                var withClauses = new List<string>();
                foreach (var col in colsProp.EnumerateArray())
                {
                    var cId = col.TryGetProperty("id", out var cip) ? cip.GetString() : "";
                    var cLabel = col.TryGetProperty("label", out var clp) ? clp.GetString() : cId;
                    var cType = col.TryGetProperty("type", out var ctp) ? ctp.GetString() : "text";
                    var sqlDataType = (cType == "number" || cType == "calculated") ? "DECIMAL(18,2)" : "NVARCHAR(500)";
                    colInfoList.Add($"[{cId}] ({cLabel}: {cType})");
                    withClauses.Add($"        [{cId}] {sqlDataType} '$.{cId}'");
                }
                schemaDescriptions.AppendLine($"  - REPEATER GRID / ITEM TABLE: Field '$.{qId}' | Question Label: '{qLabel}' | Type: {qType} | Belongs to Form: '{formTitle}' (FormID: {formId}, Version: {versionStr})");
                schemaDescriptions.AppendLine($"    * Internal Columns: {string.Join(", ", colInfoList)}");
                schemaDescriptions.AppendLine($"    * To query, filter, or SUM/aggregate items from this grid in T-SQL, USE:");
                schemaDescriptions.AppendLine($"      CROSS APPLY OPENJSON(s.DataJSON, '$.{qId}') WITH (\n{string.Join(",\n", withClauses)}\n      ) AS [items_{qId}]");
            }
            else
            {
                schemaDescriptions.AppendLine($"  - Field key: JSON_VALUE(DataJSON, '$.{qId}') | Question Label: '{qLabel}' | Type: {qType} | Belongs to Form: '{formTitle}' (FormID: {formId}, Version: {versionStr})");
            }
        }

        foreach (var f in forms)
        {
            schemaDescriptions.AppendLine($"\n=======================================================");
            schemaDescriptions.AppendLine($"FORM ID: {f.FormID} | TITLE: '{f.Title}' | VERSION: {f.Version}.{f.Revision}");
            schemaDescriptions.AppendLine($"=======================================================");
            try
            {
                using var doc = JsonDocument.Parse(f.SchemaJSON);
                if (doc.RootElement.TryGetProperty("sections", out var sections) && sections.ValueKind == JsonValueKind.Array)
                {
                    foreach (var sec in sections.EnumerateArray())
                    {
                        var secTitle = sec.TryGetProperty("title", out var st) ? st.GetString() : "";
                        schemaDescriptions.AppendLine($"Section: {secTitle}");
                        var questionsProp = sec.TryGetProperty("questions", out var qp) ? qp : (sec.TryGetProperty("fields", out var fp) ? fp : default);
                        if (questionsProp.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var q in questionsProp.EnumerateArray())
                            {
                                AppendQuestionSchema(q, f.Title, f.FormID, $"{f.Version}.{f.Revision}");
                            }
                        }
                    }
                }
                else if (doc.RootElement.TryGetProperty("questions", out var rootQuestions) && rootQuestions.ValueKind == JsonValueKind.Array)
                {
                    foreach (var q in rootQuestions.EnumerateArray())
                    {
                        AppendQuestionSchema(q, f.Title, f.FormID, $"{f.Version}.{f.Revision}");
                    }
                }
            }
            catch
            {
                schemaDescriptions.AppendLine($"Raw schema: {f.SchemaJSON}");
            }
        }

        var baseInstructions = !string.IsNullOrWhiteSpace(config.SystemPrompt)
            ? config.SystemPrompt
            : DefaultSystemPrompt;

        var systemPrompt = $@"{baseInstructions}

Database & Schema Context:
Data is stored in Microsoft SQL Server.
Tables available:
- dbo.FormSubmissions (SubmissionID, FormID, TrackingCode, WorkflowStatus, SubmittedByUserID, SubmittedAt, CompletedAt, DataJSON)
- dbo.AppUsers (UserID, Username, DisplayName, Email)
- dbo.Forms (FormID, FormCode, Title, Version, Revision, Status)

Critical Instructions for Form Versioning & Cross-Querying:
1. Each form has a unique FormID tied to its specific Version and Revision (Version.Revision).
2. When querying or filtering submissions for a form, ALWAYS filter by the exact FormID specified in the schema descriptions (or join on FormID where appropriate).
3. Field data is stored as JSON in the DataJSON column of dbo.FormSubmissions.
   - For regular scalar fields, extract using JSON_VALUE(DataJSON, '$.field_key').
   - For repeater grid / item table fields (repeater_grid or table), items are stored as a JSON array. To query, filter, or aggregate (e.g. SUM quantities/amounts), ALWAYS USE:
     CROSS APPLY OPENJSON(s.DataJSON, '$.field_id') WITH (
         [column_id] DATATYPE '$.column_id',
         ...
     ) AS items_alias
4. The user's request will contain field references in the format `[FormTitle (Version): FieldLabel]` or `[FormTitle: FieldLabel]` (e.g. `[فرم سازمانی جدید (نگارش 1.1): عنوان کامل درخواست]`). Carefully match each reference to the exact form and its corresponding JSON field key from the schema descriptions above.
5. When joining submissions from multiple forms, join them on common business keys mentioned by user (such as personnel code, national ID, tracking code) or join on `SubmittedByUserID` if analyzing requests by the same user.
6. If multiple forms are analyzed, explain how they relate and handle version differences cleanly.

Generate:
1. An efficient, production-ready T-SQL query joining or aggregating the forms using JSON_VALUE(DataJSON, '$.field_id') and respecting the selected FormID / versions.
2. A ready-to-run CREATE OR ALTER VIEW dbo.vw_Custom_... AS ... statement suitable for Power BI direct query or reporting.
3. A comprehensive Persian explanation of the query structure, join conditions, and version logic.

Output format: You MUST return a valid JSON object with exactly two keys:
{{
  ""sqlQuery"": ""-- T-SQL code here"",
  ""explanation"": ""توضیحات کامل فارسی در مورد نحوه کوئری، نسخه‌ها و فیلترها""
}}";

        var userMessage = $"Form Schemas:\n{schemaDescriptions}\nUser Request (Persian):\n{dto.UserPrompt}\nGenerate the SQL query joining or filtering these forms as requested.";

        try
        {
            using var client = CreateAiHttpClient(TimeSpan.FromSeconds(120));

            var cleanUrl = CleanBaseUrl(config.BaseUrl);
            var endpoint = cleanUrl + "/chat/completions";
            var requestBody = new
            {
                model = config.ModelName,
                messages = new[]
                {
                    new { role = "system", content = systemPrompt },
                    new { role = "user", content = userMessage }
                },
                temperature = config.Temperature,
                max_tokens = config.MaxTokens > 0 ? config.MaxTokens : 2048,
                response_format = new { type = "json_object" }
            };

            var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json")
            };

            request.Headers.TryAddWithoutValidation("User-Agent", "BPMS-Platform/1.0 (Windows NT 10.0; Win64; x64)");
            request.Headers.TryAddWithoutValidation("HTTP-Referer", "http://localhost:5000");
            request.Headers.TryAddWithoutValidation("X-Title", "BPMS AI Studio");

            if (!string.IsNullOrWhiteSpace(config.ApiKey))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey.Trim());
            }

            var response = await client.SendAsync(request);
            var responseString = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return StatusCode((int)response.StatusCode, new { Message = "خطا در فراخوانی هوش مصنوعی: " + responseString });

            using var resDoc = JsonDocument.Parse(responseString);
            var content = resDoc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString();

            return Content(content ?? "{}", "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI query generation failed");
            return StatusCode(500, new { Message = "خطا در ارتباط با سرور هوش مصنوعی: " + ex.Message });
        }
    }
}
