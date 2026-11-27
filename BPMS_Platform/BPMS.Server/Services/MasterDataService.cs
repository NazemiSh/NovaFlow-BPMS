using System.Data;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;
using BPMS.Server.Data;
using BPMS.Server.DTOs;
using BPMS.Server.Models;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Win32.SafeHandles;

namespace BPMS.Server.Services;

public class MasterDataService : IMasterDataService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<MasterDataService> _logger;

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool LogonUser(
        string lpszUsername,
        string? lpszDomain,
        string lpszPassword,
        int dwLogonType,
        int dwLogonProvider,
        out SafeAccessTokenHandle phToken);

    private const int LOGON32_LOGON_NEW_CREDENTIALS = 9;
    private const int LOGON32_PROVIDER_WINNT50 = 3;

    private async Task<T> ExecuteWithConnectionCredentialsAsync<T>(
        string? authType,
        string? username,
        string? rawPassword,
        Func<Task<T>> action)
    {
        bool isWindows = string.Equals(authType, "Windows", StringComparison.OrdinalIgnoreCase);
        if (OperatingSystem.IsWindows() && isWindows && !string.IsNullOrWhiteSpace(username) && !string.IsNullOrEmpty(rawPassword))
        {
            string? domain = null;
            string user = username.Trim();

            if (user.Contains('\\'))
            {
                var parts = user.Split('\\', 2);
                domain = parts[0];
                user = parts[1];
            }
            else if (user.Contains('@'))
            {
                domain = null; // UPN format e.g. user@domain.local
            }

            bool logonSuccess = LogonUser(
                user,
                domain,
                rawPassword,
                LOGON32_LOGON_NEW_CREDENTIALS,
                LOGON32_PROVIDER_WINNT50,
                out var safeTokenHandle);

            if (!logonSuccess)
            {
                int err = Marshal.GetLastWin32Error();
                throw new InvalidOperationException($"احراز هویت اکانت دامنه با شکست مواجه شد (کاربر: {username}). Win32 Error Code: {err}");
            }

            using (safeTokenHandle)
            {
                return await WindowsIdentity.RunImpersonatedAsync(safeTokenHandle, async () =>
                {
                    return await action();
                });
            }
        }

        return await action();
    }

    public MasterDataService(ApplicationDbContext context, ILogger<MasterDataService> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Connections

    public async Task<List<ConnectionResponseDto>> GetConnectionsAsync()
    {
        var list = await _context.MasterDataConnections
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync();

        return list.Select(c => new ConnectionResponseDto
        {
            Id = c.Id,
            Name = c.Name,
            ServerAddress = c.ServerAddress,
            DatabaseName = c.DatabaseName,
            AuthType = c.AuthType ?? "Sql",
            Username = c.Username,
            HasPassword = !string.IsNullOrEmpty(c.EncryptedPassword),
            IsActive = c.IsActive,
            CreatedAt = c.CreatedAt
        }).ToList();
    }

    public async Task<ConnectionResponseDto> GetConnectionByIdAsync(int id)
    {
        var c = await _context.MasterDataConnections.FindAsync(id)
            ?? throw new KeyNotFoundException($"اتصال با شناسه {id} یافت نشد.");

        return new ConnectionResponseDto
        {
            Id = c.Id,
            Name = c.Name,
            ServerAddress = c.ServerAddress,
            DatabaseName = c.DatabaseName,
            AuthType = c.AuthType ?? "Sql",
            Username = c.Username,
            HasPassword = !string.IsNullOrEmpty(c.EncryptedPassword),
            IsActive = c.IsActive,
            CreatedAt = c.CreatedAt
        };
    }

    public async Task<ConnectionResponseDto> CreateConnectionAsync(ConnectionDto dto)
    {
        var authType = !string.IsNullOrWhiteSpace(dto.AuthType) ? dto.AuthType.Trim() : "Sql";
        var isWindows = string.Equals(authType, "Windows", StringComparison.OrdinalIgnoreCase);

        var conn = new MasterDataConnection
        {
            Name = dto.Name.Trim(),
            ServerAddress = dto.ServerAddress.Trim(),
            DatabaseName = dto.DatabaseName.Trim(),
            AuthType = authType,
            Username = !string.IsNullOrWhiteSpace(dto.Username) ? dto.Username.Trim() : null,
            EncryptedPassword = !string.IsNullOrEmpty(dto.Password) ? CryptoHelper.Encrypt(dto.Password) : null,
            IsActive = dto.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        _context.MasterDataConnections.Add(conn);
        await _context.SaveChangesAsync();

        return new ConnectionResponseDto
        {
            Id = conn.Id,
            Name = conn.Name,
            ServerAddress = conn.ServerAddress,
            DatabaseName = conn.DatabaseName,
            AuthType = conn.AuthType,
            Username = conn.Username,
            HasPassword = !string.IsNullOrEmpty(conn.EncryptedPassword),
            IsActive = conn.IsActive,
            CreatedAt = conn.CreatedAt
        };
    }

    public async Task<ConnectionResponseDto> UpdateConnectionAsync(int id, ConnectionDto dto)
    {
        var conn = await _context.MasterDataConnections.FindAsync(id)
            ?? throw new KeyNotFoundException($"اتصال با شناسه {id} یافت نشد.");

        var authType = !string.IsNullOrWhiteSpace(dto.AuthType) ? dto.AuthType.Trim() : "Sql";
        var isWindows = string.Equals(authType, "Windows", StringComparison.OrdinalIgnoreCase);

        conn.Name = dto.Name.Trim();
        conn.ServerAddress = dto.ServerAddress.Trim();
        conn.DatabaseName = dto.DatabaseName.Trim();
        conn.AuthType = authType;
        conn.Username = !string.IsNullOrWhiteSpace(dto.Username) ? dto.Username.Trim() : null;
        conn.IsActive = dto.IsActive;

        if (!string.IsNullOrEmpty(dto.Password))
        {
            conn.EncryptedPassword = CryptoHelper.Encrypt(dto.Password);
        }
        else if (string.IsNullOrWhiteSpace(dto.Username))
        {
            conn.EncryptedPassword = null;
        }

        await _context.SaveChangesAsync();

        return new ConnectionResponseDto
        {
            Id = conn.Id,
            Name = conn.Name,
            ServerAddress = conn.ServerAddress,
            DatabaseName = conn.DatabaseName,
            AuthType = conn.AuthType,
            Username = conn.Username,
            HasPassword = !string.IsNullOrEmpty(conn.EncryptedPassword),
            IsActive = conn.IsActive,
            CreatedAt = conn.CreatedAt
        };
    }

    public async Task DeleteConnectionAsync(int id)
    {
        var conn = await _context.MasterDataConnections.FindAsync(id)
            ?? throw new KeyNotFoundException($"اتصال با شناسه {id} یافت نشد.");

        var hasReferencingTables = await _context.MasterDataTables.AnyAsync(t => t.ConnectionId == id);
        if (hasReferencingTables)
        {
            throw new InvalidOperationException("این اتصال در یک یا چند جدول مرجع استفاده شده است و حذف آن مجاز نیست. ابتدا جداول مربوطه را حذف یا اتصال آنها را تغییر دهید.");
        }

        _context.MasterDataConnections.Remove(conn);
        await _context.SaveChangesAsync();
    }

    public async Task<ConnectionTestResultDto> TestConnectionAsync(ConnectionTestRequestDto dto)
    {
        string server = "";
        string db = "";
        string authType = "Sql";
        string user = "";
        string pass = "";

        if (dto.ConnectionId.HasValue && dto.ConnectionId.Value > 0)
        {
            var saved = await _context.MasterDataConnections.FindAsync(dto.ConnectionId.Value)
                ?? throw new KeyNotFoundException("اتصال مورد نظر یافت نشد.");

            server = saved.ServerAddress;
            db = saved.DatabaseName;
            authType = saved.AuthType ?? "Sql";
            user = saved.Username ?? "";
            pass = !string.IsNullOrEmpty(saved.EncryptedPassword) ? CryptoHelper.Decrypt(saved.EncryptedPassword) : "";
        }
        else
        {
            server = dto.ServerAddress ?? "";
            db = dto.DatabaseName ?? "";
            authType = dto.AuthType ?? "Sql";
            user = dto.Username ?? "";
            pass = dto.Password ?? "";
        }

        bool isWindows = string.Equals(authType, "Windows", StringComparison.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(server) || string.IsNullOrWhiteSpace(db) || (!isWindows && string.IsNullOrWhiteSpace(user)))
        {
            return new ConnectionTestResultDto
            {
                Success = false,
                Message = isWindows
                    ? "اطلاعات اتصال (آدرس سرور و نام دیتابیس) ناقص است."
                    : "اطلاعات اتصال (آدرس سرور، نام دیتابیس و نام کاربری) ناقص است."
            };
        }

        try
        {
            return await ExecuteWithConnectionCredentialsAsync(authType, user, pass, async () =>
            {
                var connStr = BuildSqlConnectionString(server, db, authType, user, pass);
                using var conn = new SqlConnection(connStr);
                await conn.OpenAsync();

                using var cmd = new SqlCommand("SELECT @@VERSION;", conn);
                cmd.CommandTimeout = 10;
                var version = (await cmd.ExecuteScalarAsync())?.ToString();

                var authModeDesc = isWindows
                    ? (!string.IsNullOrWhiteSpace(user) ? $"سرویس اکانت دامنه ({user})" : "هویت پیش‌فرض سرور / IIS")
                    : $"احراز هویت SQL ({user})";

                return new ConnectionTestResultDto
                {
                    Success = true,
                    Message = $"✅ اتصال با موفقیت برقرار گردید ({authModeDesc}). مشخصات سرور: {version?.Split('\n').FirstOrDefault()?.Trim()}"
                };
            });
        }
        catch (Exception ex)
        {
            return new ConnectionTestResultDto
            {
                Success = false,
                Message = $"خطا در برقراری اتصال: {ex.Message}"
            };
        }
    }

    #endregion

    #region SQL Query Validation & Preview

    public bool ValidateReadOnlyQuery(string sqlQuery, out string? errorMessage)
    {
        errorMessage = null;
        if (string.IsNullOrWhiteSpace(sqlQuery))
        {
            errorMessage = "متن کوئری SQL نمی‌تواند خالی باشد.";
            return false;
        }

        // 1. Remove comments
        var clean = Regex.Replace(sqlQuery, @"/\*.*?\*/", " ", RegexOptions.Singleline);
        clean = Regex.Replace(clean, @"--.*?(\r?\n|$)", " ");
        clean = clean.Trim();

        // 2. Must start with SELECT or WITH
        if (!Regex.IsMatch(clean, @"^(SELECT|WITH)\b", RegexOptions.IgnoreCase))
        {
            errorMessage = "کوئری فقط باید با دستور SELECT یا WITH (برای CTE) آغاز شود.";
            return false;
        }

        // 3. Reject multiple statements
        if (clean.Contains(';'))
        {
            var parts = clean.Split(';').Select(p => p.Trim()).Where(p => !string.IsNullOrEmpty(p)).ToList();
            if (parts.Count > 1)
            {
                errorMessage = "ارسال چندین دستور SQL مجزا در یک کوئری به دلایل امنیتی مسدود است.";
                return false;
            }
        }

        // 4. Ban dangerous / DDL / DML / system keywords
        var forbiddenPattern = @"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|EXEC|EXECUTE|MERGE|GRANT|REVOKE|DENY|SHUTDOWN|XP_|SP_|INTO)\b";
        var match = Regex.Match(clean, forbiddenPattern, RegexOptions.IgnoreCase);
        if (match.Success)
        {
            errorMessage = $"استفاده از دستور تغییر داده یا عملیات سیستمی «{match.Value}» در بانک داده‌های مرجع مجاز نیست. کوئری باید حتماً فقط-خواندنی (Read-Only) باشد.";
            return false;
        }

        return true;
    }

    public async Task<PreviewSqlResultDto> PreviewSqlSchemaAsync(PreviewSqlRequestDto dto)
    {
        if (!ValidateReadOnlyQuery(dto.SqlQuery, out var valError))
        {
            return new PreviewSqlResultDto { Success = false, ErrorMessage = valError };
        }

        string server = "";
        string db = "";
        string authType = "Sql";
        string user = "";
        string pass = "";

        if (dto.ConnectionId.HasValue && dto.ConnectionId.Value > 0)
        {
            var saved = await _context.MasterDataConnections.FindAsync(dto.ConnectionId.Value)
                ?? throw new KeyNotFoundException("اتصال مورد نظر یافت نشد.");

            server = saved.ServerAddress;
            db = saved.DatabaseName;
            authType = saved.AuthType ?? "Sql";
            user = saved.Username ?? "";
            pass = !string.IsNullOrEmpty(saved.EncryptedPassword) ? CryptoHelper.Decrypt(saved.EncryptedPassword) : "";
        }
        else
        {
            server = dto.ServerAddress ?? "";
            db = dto.DatabaseName ?? "";
            authType = dto.AuthType ?? "Sql";
            user = dto.Username ?? "";
            pass = dto.Password ?? "";
        }

        try
        {
            return await ExecuteWithConnectionCredentialsAsync(authType, user, pass, async () =>
            {
                var connStr = BuildSqlConnectionString(server, db, authType, user, pass);
                using var conn = new SqlConnection(connStr);
                await conn.OpenAsync();

                // Execute clean query directly without derived table wrapping so ORDER BY, CTE, etc. work seamlessly
                var cleanQuery = dto.SqlQuery.Trim().TrimEnd(';');

                using var cmd = new SqlCommand(cleanQuery, conn);
                cmd.CommandTimeout = 30;

                using var reader = await cmd.ExecuteReaderAsync();
                var columns = new List<TableColumnDef>();
                var schemaTable = reader.GetColumnSchema();

                foreach (var col in schemaTable)
                {
                    var dt = "string";
                    var t = col.DataType;
                    if (t != null)
                    {
                        if (t == typeof(int) || t == typeof(long) || t == typeof(short) || t == typeof(decimal) || t == typeof(double) || t == typeof(float) || t == typeof(byte))
                        {
                            dt = "number";
                        }
                        else if (t == typeof(DateTime) || t == typeof(DateOnly) || t == typeof(DateTimeOffset))
                        {
                            dt = "date";
                        }
                    }

                    columns.Add(new TableColumnDef
                    {
                        Name = col.ColumnName,
                        Title = col.ColumnName,
                        DataType = dt
                    });
                }

                var rows = new List<Dictionary<string, object?>>();
                while (rows.Count < 10 && await reader.ReadAsync())
                {
                    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var colName = reader.GetName(i);
                        var val = await reader.IsDBNullAsync(i) ? null : reader.GetValue(i);
                        if (val is DateTime d)
                        {
                            row[colName] = d.ToString("yyyy-MM-dd HH:mm:ss");
                        }
                        else
                        {
                            row[colName] = val?.ToString();
                        }
                    }
                    rows.Add(row);
                }

                return new PreviewSqlResultDto
                {
                    Success = true,
                    Columns = columns,
                    SampleRows = rows
                };
            });
        }
        catch (Exception ex)
        {
            return new PreviewSqlResultDto
            {
                Success = false,
                ErrorMessage = $"خطا در اجرای کوئری روی سرور مبدأ: {ex.Message}"
            };
        }
    }

    public async Task<PreviewSqlFullResultDto> PreviewSqlFullAsync(PreviewSqlFullRequestDto dto)
    {
        if (!ValidateReadOnlyQuery(dto.SqlQuery, out var valError))
        {
            return new PreviewSqlFullResultDto { Success = false, ErrorMessage = valError };
        }

        string server = "";
        string db = "";
        string authType = "Sql";
        string user = "";
        string pass = "";

        if (dto.ConnectionId.HasValue && dto.ConnectionId.Value > 0)
        {
            var saved = await _context.MasterDataConnections.FindAsync(dto.ConnectionId.Value)
                ?? throw new KeyNotFoundException("اتصال مورد نظر یافت نشد.");

            server = saved.ServerAddress;
            db = saved.DatabaseName;
            authType = saved.AuthType ?? "Sql";
            user = saved.Username ?? "";
            pass = !string.IsNullOrEmpty(saved.EncryptedPassword) ? CryptoHelper.Decrypt(saved.EncryptedPassword) : "";
        }
        else
        {
            server = dto.ServerAddress ?? "";
            db = dto.DatabaseName ?? "";
            authType = dto.AuthType ?? "Sql";
            user = dto.Username ?? "";
            pass = dto.Password ?? "";
        }

        int maxRows = Math.Clamp(dto.MaxRows > 0 ? dto.MaxRows : 20000, 10, 20000);

        try
        {
            return await ExecuteWithConnectionCredentialsAsync(authType, user, pass, async () =>
            {
                var connStr = BuildSqlConnectionString(server, db, authType, user, pass);
                using var conn = new SqlConnection(connStr);
                await conn.OpenAsync();

                var cleanQuery = dto.SqlQuery.Trim().TrimEnd(';');
                using var cmd = new SqlCommand(cleanQuery, conn);
                cmd.CommandTimeout = 120; // 2 minutes

                using var reader = await cmd.ExecuteReaderAsync();
                var columns = new List<TableColumnDef>();
                var schemaTable = reader.GetColumnSchema();

                foreach (var col in schemaTable)
                {
                    var dt = "string";
                    var t = col.DataType;
                    if (t != null)
                    {
                        if (t == typeof(int) || t == typeof(long) || t == typeof(short) || t == typeof(decimal) || t == typeof(double) || t == typeof(float) || t == typeof(byte))
                        {
                            dt = "number";
                        }
                        else if (t == typeof(DateTime) || t == typeof(DateOnly) || t == typeof(DateTimeOffset))
                        {
                            dt = "date";
                        }
                    }

                    columns.Add(new TableColumnDef
                    {
                        Name = col.ColumnName,
                        Title = col.ColumnName,
                        DataType = dt
                    });
                }

                var rows = new List<Dictionary<string, object?>>();
                bool isTruncated = false;

                while (await reader.ReadAsync())
                {
                    if (rows.Count >= maxRows)
                    {
                        isTruncated = true;
                        break;
                    }

                    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        var colName = reader.GetName(i);
                        var val = await reader.IsDBNullAsync(i) ? null : reader.GetValue(i);
                        if (val is DateTime d)
                        {
                            row[colName] = d.ToString("yyyy-MM-dd HH:mm:ss");
                        }
                        else
                        {
                            row[colName] = val?.ToString();
                        }
                    }
                    rows.Add(row);
                }

                return new PreviewSqlFullResultDto
                {
                    Success = true,
                    Columns = columns,
                    Rows = rows,
                    TotalCount = rows.Count,
                    IsTruncated = isTruncated
                };
            });
        }
        catch (Exception ex)
        {
            return new PreviewSqlFullResultDto
            {
                Success = false,
                ErrorMessage = $"خطا در اجرای کوئری کامل روی سرور مبدأ: {ex.Message}"
            };
        }
    }

    #endregion

    #region Tables Management

    public async Task<List<TableResponseDto>> GetTablesAsync()
    {
        var tables = await _context.MasterDataTables
            .Include(t => t.Connection)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return tables.Select(MapToTableDto).ToList();
    }

    public async Task<TableResponseDto> GetTableByIdAsync(int id)
    {
        var t = await _context.MasterDataTables
            .Include(t => t.Connection)
            .FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {id} یافت نشد.");

        return MapToTableDto(t);
    }

    public async Task<TableResponseDto> CreateTableAsync(TableCreateUpdateDto dto)
    {
        var code = dto.Code.Trim().ToUpperInvariant();
        if (await _context.MasterDataTables.AnyAsync(t => t.Code == code))
        {
            throw new InvalidOperationException($"کد جدول «{code}» قبلاً در سیستم ثبت شده است و باید یکتا باشد.");
        }

        if (dto.SourceType == "SqlQuery")
        {
            if (!dto.ConnectionId.HasValue)
                throw new InvalidOperationException("برای جداول نوع کوئری SQL، انتخاب اتصال پایگاه‌داده الزامی است.");
            if (string.IsNullOrWhiteSpace(dto.SqlQuery))
                throw new InvalidOperationException("متن کوئری SQL الزامی است.");
            if (!ValidateReadOnlyQuery(dto.SqlQuery, out var qErr))
                throw new InvalidOperationException(qErr);
        }

        var table = new MasterDataTable
        {
            Code = code,
            Title = dto.Title.Trim(),
            SourceType = dto.SourceType,
            ConnectionId = dto.ConnectionId,
            SqlQuery = dto.SqlQuery?.Trim(),
            UniqueKeyColumn = dto.UniqueKeyColumn.Trim(),
            ColumnsJson = JsonSerializer.Serialize(dto.Columns),
            SyncScheduleType = dto.SyncScheduleType,
            SyncScheduleValue = dto.SyncScheduleValue?.Trim(),
            ScheduleConfigJson = dto.ScheduleConfigJson,
            FilterRulesJson = dto.FilterRulesJson,
            ExcludedKeysJson = dto.ExcludedKeysJson,
            NextRunAt = MasterDataSchedulerEngine.CalculateNextRun(dto.ScheduleConfigJson, DateTime.UtcNow, dto.SyncScheduleType, dto.SyncScheduleValue),
            RecordCount = 0,
            VersionHash = Guid.NewGuid().ToString("N"),
            IsActive = dto.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        _context.MasterDataTables.Add(table);
        await _context.SaveChangesAsync();

        return MapToTableDto(table);
    }

    public async Task<TableResponseDto> UpdateTableAsync(int id, TableCreateUpdateDto dto)
    {
        var table = await _context.MasterDataTables.FindAsync(id)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {id} یافت نشد.");

        var code = dto.Code.Trim().ToUpperInvariant();
        if (await _context.MasterDataTables.AnyAsync(t => t.Code == code && t.Id != id))
        {
            throw new InvalidOperationException($"کد جدول «{code}» توسط جدول دیگری استفاده شده است.");
        }

        if (dto.SourceType == "SqlQuery")
        {
            if (!dto.ConnectionId.HasValue)
                throw new InvalidOperationException("برای جداول نوع کوئری SQL، انتخاب اتصال پایگاه‌داده الزامی است.");
            if (string.IsNullOrWhiteSpace(dto.SqlQuery))
                throw new InvalidOperationException("متن کوئری SQL الزامی است.");
            if (!ValidateReadOnlyQuery(dto.SqlQuery, out var qErr))
                throw new InvalidOperationException(qErr);
        }

        table.Code = code;
        table.Title = dto.Title.Trim();
        table.SourceType = dto.SourceType;
        table.ConnectionId = dto.ConnectionId;
        table.SqlQuery = dto.SqlQuery?.Trim();
        table.UniqueKeyColumn = dto.UniqueKeyColumn.Trim();
        table.ColumnsJson = JsonSerializer.Serialize(dto.Columns);
        table.SyncScheduleType = dto.SyncScheduleType;
        table.SyncScheduleValue = dto.SyncScheduleValue?.Trim();
        table.ScheduleConfigJson = dto.ScheduleConfigJson;
        table.FilterRulesJson = dto.FilterRulesJson;
        table.ExcludedKeysJson = dto.ExcludedKeysJson;
        table.NextRunAt = MasterDataSchedulerEngine.CalculateNextRun(dto.ScheduleConfigJson, DateTime.UtcNow, dto.SyncScheduleType, dto.SyncScheduleValue);
        table.IsActive = dto.IsActive;
        table.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return MapToTableDto(table);
    }

    public async Task DeleteTableAsync(int id)
    {
        var table = await _context.MasterDataTables.FindAsync(id)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {id} یافت نشد.");

        _context.MasterDataTables.Remove(table);
        await _context.SaveChangesAsync();
    }

    #endregion

    #region Sync & Upsert Data

    public async Task<TableResponseDto> SyncTableAsync(int tableId)
    {
        var table = await _context.MasterDataTables
            .Include(t => t.Connection)
            .FirstOrDefaultAsync(t => t.Id == tableId)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {tableId} یافت نشد.");

        if (table.SourceType != "SqlQuery")
        {
            throw new InvalidOperationException("عملیات همگام‌سازی خودکار مستقیم تنها برای جداول از نوع کوئری SQL تعریف شده است. برای فایل‌های اکسل از گزینه ایمپورت استفاده فرمایید.");
        }

        if (table.Connection == null)
        {
            throw new InvalidOperationException("اتصال پایگاه‌داده برای این جدول تعریف نشده است.");
        }

        if (string.IsNullOrWhiteSpace(table.SqlQuery))
        {
            throw new InvalidOperationException("متن کوئری SQL برای این جدول تنظیم نشده است.");
        }

        if (!ValidateReadOnlyQuery(table.SqlQuery, out var qErr))
        {
            table.LastSyncStatus = "Failed";
            table.LastSyncError = qErr;
            table.LastSyncAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            throw new InvalidOperationException(qErr);
        }

        try
        {
            var pass = !string.IsNullOrEmpty(table.Connection.EncryptedPassword)
                ? CryptoHelper.Decrypt(table.Connection.EncryptedPassword)
                : "";

            var sourceRows = new List<Dictionary<string, object?>>();

            await ExecuteWithConnectionCredentialsAsync(
                table.Connection.AuthType,
                table.Connection.Username,
                pass,
                async () =>
                {
                    var connStr = BuildSqlConnectionString(
                        table.Connection.ServerAddress,
                        table.Connection.DatabaseName,
                        table.Connection.AuthType,
                        table.Connection.Username,
                        pass);

                    using var conn = new SqlConnection(connStr);
                    await conn.OpenAsync();
                    using var cmd = new SqlCommand(table.SqlQuery, conn);
                    cmd.CommandTimeout = 120; // 2 minutes

                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                        for (int i = 0; i < reader.FieldCount; i++)
                        {
                            var colName = reader.GetName(i);
                            var val = await reader.IsDBNullAsync(i) ? null : reader.GetValue(i);
                            if (val is DateTime d)
                            {
                                row[colName] = d.ToString("yyyy-MM-dd HH:mm:ss");
                            }
                            else
                            {
                                row[colName] = val?.ToString();
                            }
                        }
                        sourceRows.Add(row);
                    }
                    return true;
                });

            await UpsertTableRowsAsync(table, sourceRows);

            table.LastSyncStatus = "Success";
            table.LastSyncError = null;
            table.LastSyncAt = DateTime.UtcNow;
            table.NextRunAt = MasterDataSchedulerEngine.CalculateNextRun(
                table.ScheduleConfigJson,
                DateTime.UtcNow,
                table.SyncScheduleType,
                table.SyncScheduleValue);
            await _context.SaveChangesAsync();

            return MapToTableDto(table);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Sync failed for master table {TableCode} ({TableId})", table.Code, table.Id);
            table.LastSyncStatus = "Failed";
            table.LastSyncError = ex.Message;
            table.LastSyncAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            throw;
        }
    }

    public async Task<MasterDataImportResultDto> ImportDataAsync(
        int tableId,
        Stream fileStream,
        string fileName,
        string? sheetName = null,
        List<ExcelColumnMappingDto>? columnMappings = null)
    {
        var table = await _context.MasterDataTables.FindAsync(tableId)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {tableId} یافت نشد.");

        var parsed = ExcelCsvHelper.ParseWorkbook(fileStream, fileName, sheetName);
        if (parsed.Rows.Count == 0)
        {
            throw new InvalidOperationException("هیچ سطری در فایل یا شیت انتخاب‌شده یافت نشد.");
        }

        List<Dictionary<string, object?>> rowsToImport;
        bool mergeExistingColumns = false;

        var validMappings = (columnMappings ?? new List<ExcelColumnMappingDto>())
            .Where(m => !string.IsNullOrWhiteSpace(m.SourceHeader) && !string.IsNullOrWhiteSpace(m.TargetColumnName))
            .ToList();

        if (validMappings.Count > 0)
        {
            mergeExistingColumns = true;
            rowsToImport = new List<Dictionary<string, object?>>(parsed.Rows.Count);

            foreach (var rawRow in parsed.Rows)
            {
                var projected = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (var mapping in validMappings)
                {
                    object? val = null;
                    if (!rawRow.TryGetValue(mapping.SourceHeader, out val))
                    {
                        var matchedKey = rawRow.Keys.FirstOrDefault(k => k.Equals(mapping.SourceHeader, StringComparison.OrdinalIgnoreCase));
                        if (matchedKey != null) val = rawRow[matchedKey];
                    }
                    projected[mapping.TargetColumnName.Trim()] = val;
                }
                rowsToImport.Add(projected);
            }
        }
        else
        {
            rowsToImport = parsed.Rows;
        }

        try
        {
            var (insertedCount, updatedCount, skippedCount) = await UpsertTableRowsAsync(table, rowsToImport, mergeExistingColumns);

            table.LastSyncStatus = "Success";
            table.LastSyncError = null;
            table.LastSyncAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var tableDto = MapToTableDto(table);
            var importedCount = insertedCount + updatedCount;
            var msg = $"داده‌ها با موفقیت ایمپورت شدند: {importedCount} رکورد پردازش شد ({insertedCount} درج جدید، {updatedCount} به‌روزرسانی" +
                      (skippedCount > 0 ? $"، {skippedCount} ردیف بدون کلید یکتا نادیده گرفته شد" : "") +
                      $"). کل رکوردهای فعال: {tableDto.RecordCount}";

            return new MasterDataImportResultDto
            {
                Message = msg,
                Table = tableDto,
                ImportedCount = importedCount,
                InsertedCount = insertedCount,
                UpdatedCount = updatedCount,
                SkippedCount = skippedCount
            };
        }
        catch (Exception ex)
        {
            table.LastSyncStatus = "Failed";
            table.LastSyncError = ex.Message;
            table.LastSyncAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            throw;
        }
    }

    private async Task<(int InsertedCount, int UpdatedCount, int SkippedCount)> UpsertTableRowsAsync(
        MasterDataTable table,
        List<Dictionary<string, object?>> sourceRows,
        bool mergeExistingColumns = false)
    {
        var keyCol = table.UniqueKeyColumn;
        var existingRecords = await _context.MasterDataRecords
            .Where(r => r.TableId == table.Id)
            .ToListAsync();

        var existingDict = existingRecords.ToDictionary(r => r.UniqueKeyValue, StringComparer.OrdinalIgnoreCase);
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var now = DateTime.UtcNow;

        var filterRules = DeserializeFilterRules(table.FilterRulesJson);
        var excludedKeys = DeserializeExcludedKeys(table.ExcludedKeysJson);

        int insertedCount = 0;
        int updatedCount = 0;
        int skippedCount = 0;
        var updatedSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var insertedSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var row in sourceRows)
        {
            // Find key value
            string? keyValue = null;
            if (row.TryGetValue(keyCol, out var kVal) && kVal != null)
            {
                keyValue = kVal.ToString()?.Trim();
            }

            if (string.IsNullOrWhiteSpace(keyValue))
            {
                // Fallback: check case-insensitive match on keys
                var matchKey = row.Keys.FirstOrDefault(k => k.Equals(keyCol, StringComparison.OrdinalIgnoreCase));
                if (matchKey != null && row[matchKey] != null)
                {
                    keyValue = row[matchKey]?.ToString()?.Trim();
                }
            }

            if (string.IsNullOrWhiteSpace(keyValue))
            {
                skippedCount++;
                continue;
            }

            // 1. Skip if key is explicitly excluded
            if (excludedKeys.Contains(keyValue))
            {
                skippedCount++;
                continue;
            }

            // 2. Skip if row fails column filter rules
            if (!MatchesFilterRules(row, filterRules))
            {
                skippedCount++;
                continue;
            }

            seenKeys.Add(keyValue);

            if (existingDict.TryGetValue(keyValue, out var existing))
            {
                if (mergeExistingColumns)
                {
                    var merged = DeserializeRow(existing.RowDataJson);
                    foreach (var kv in row)
                    {
                        merged[kv.Key] = kv.Value;
                    }
                    merged[keyCol] = keyValue;
                    existing.RowDataJson = JsonSerializer.Serialize(merged);
                }
                else
                {
                    existing.RowDataJson = JsonSerializer.Serialize(row);
                }

                existing.IsActive = true;
                existing.UpdatedAt = now;
                if (!insertedSet.Contains(keyValue) && updatedSet.Add(keyValue))
                {
                    updatedCount++;
                }
            }
            else
            {
                var newRec = new MasterDataRecord
                {
                    TableId = table.Id,
                    UniqueKeyValue = keyValue,
                    RowDataJson = JsonSerializer.Serialize(row),
                    IsActive = true,
                    UpdatedAt = now
                };
                _context.MasterDataRecords.Add(newRec);
                existingDict[keyValue] = newRec;
                if (insertedSet.Add(keyValue))
                {
                    insertedCount++;
                }
            }
        }

        if (seenKeys.Count == 0 && sourceRows.Count > 0)
        {
            throw new InvalidOperationException($"هیچ رکورد معتبری با مقدار کلید یکتا در ستون «{keyCol}» یافت نشد. لطفاً نگاشت ستون کلید یکتا را بررسی کنید.");
        }

        // Deactivate records that are no longer in source or filtered/excluded out
        foreach (var r in existingRecords)
        {
            if (!seenKeys.Contains(r.UniqueKeyValue))
            {
                if (r.IsActive)
                {
                    r.IsActive = false;
                    r.UpdatedAt = now;
                }
            }
        }

        await _context.SaveChangesAsync();

        var activeCount = await _context.MasterDataRecords.CountAsync(r => r.TableId == table.Id && r.IsActive);
        table.RecordCount = activeCount;
        table.VersionHash = Guid.NewGuid().ToString("N");
        table.UpdatedAt = now;

        return (insertedCount, updatedCount, skippedCount);
    }

    public async Task CheckAndRunScheduledSyncsAsync(CancellationToken ct = default)
    {
        var scheduledTables = await _context.MasterDataTables
            .Include(t => t.Connection)
            .Where(t => t.IsActive && t.SourceType == "SqlQuery" &&
                       ((t.NextRunAt != null && t.NextRunAt <= DateTime.UtcNow) ||
                        (t.SyncScheduleType != "None" && t.SyncScheduleType != null)))
            .ToListAsync(ct);

        var nowUtc = DateTime.UtcNow;

        foreach (var t in scheduledTables)
        {
            if (ct.IsCancellationRequested) break;

            bool shouldSync = false;

            if (t.NextRunAt.HasValue)
            {
                if (t.NextRunAt.Value <= nowUtc)
                {
                    shouldSync = true;
                }
            }
            else if (t.SyncScheduleType == "IntervalMinutes")
            {
                if (int.TryParse(t.SyncScheduleValue, out var mins) && mins > 0)
                {
                    if (t.LastSyncAt == null || (nowUtc - t.LastSyncAt.Value).TotalMinutes >= mins)
                    {
                        shouldSync = true;
                    }
                }
            }
            else if (t.SyncScheduleType == "DailyTime")
            {
                if (!string.IsNullOrWhiteSpace(t.SyncScheduleValue))
                {
                    var parts = t.SyncScheduleValue.Split(':');
                    if (parts.Length == 2 && int.TryParse(parts[0], out var h) && int.TryParse(parts[1], out var m))
                    {
                        var iranTime = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, MasterDataSchedulerEngine.GetIranTimeZone());
                        if (iranTime.Hour == h && Math.Abs(iranTime.Minute - m) <= 2)
                        {
                            if (t.LastSyncAt == null || (nowUtc - t.LastSyncAt.Value).TotalMinutes >= 55)
                            {
                                shouldSync = true;
                            }
                        }
                    }
                }
            }

            if (shouldSync)
            {
                try
                {
                    _logger.LogInformation("Running scheduled sync for master table {TableCode} ({TableId})", t.Code, t.Id);
                    await SyncTableAsync(t.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Scheduled sync error for master table {TableCode}", t.Code);
                }
                finally
                {
                    try
                    {
                        t.NextRunAt = MasterDataSchedulerEngine.CalculateNextRun(t.ScheduleConfigJson, DateTime.UtcNow, t.SyncScheduleType, t.SyncScheduleValue);
                        await _context.SaveChangesAsync(ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to update NextRunAt for master table {TableCode}", t.Code);
                    }
                }
            }
        }
    }

    #endregion

    #region Records Management & Consumption

    public async Task<TableRecordsResponseDto> GetTableRecordsAsync(int tableId, string? clientVersionHash)
    {
        var table = await _context.MasterDataTables.FindAsync(tableId)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {tableId} یافت نشد.");

        if (!string.IsNullOrEmpty(clientVersionHash) && clientVersionHash.Equals(table.VersionHash, StringComparison.OrdinalIgnoreCase))
        {
            return new TableRecordsResponseDto
            {
                UpToDate = true,
                VersionHash = table.VersionHash
            };
        }

        var columns = DeserializeColumns(table.ColumnsJson);

        var activeRecords = await _context.MasterDataRecords
            .Where(r => r.TableId == tableId && r.IsActive)
            .OrderBy(r => r.UniqueKeyValue)
            .ToListAsync();

        var recordDtos = activeRecords.Select(r => new RecordItemDto
        {
            Id = r.Id,
            TableId = r.TableId,
            UniqueKeyValue = r.UniqueKeyValue,
            Data = DeserializeRow(r.RowDataJson),
            IsActive = r.IsActive,
            UpdatedAt = r.UpdatedAt
        }).ToList();

        return new TableRecordsResponseDto
        {
            UpToDate = false,
            VersionHash = table.VersionHash,
            Columns = columns,
            Records = recordDtos
        };
    }

    public async Task<List<RecordItemDto>> LookupRecordsAsync(int tableId, string? query, int limit = 20)
    {
        var q = _context.MasterDataRecords
            .Where(r => r.TableId == tableId && r.IsActive);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var search = query.Trim();
            q = q.Where(r => r.UniqueKeyValue.Contains(search) || r.RowDataJson.Contains(search));
        }

        var items = await q.OrderBy(r => r.UniqueKeyValue).Take(limit).ToListAsync();

        return items.Select(r => new RecordItemDto
        {
            Id = r.Id,
            TableId = r.TableId,
            UniqueKeyValue = r.UniqueKeyValue,
            Data = DeserializeRow(r.RowDataJson),
            IsActive = r.IsActive,
            UpdatedAt = r.UpdatedAt
        }).ToList();
    }

    public async Task<(List<RecordItemDto> Items, int TotalCount)> GetManageRecordsAsync(int tableId, int page, int pageSize, string? search)
    {
        var q = _context.MasterDataRecords.Where(r => r.TableId == tableId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(r => r.UniqueKeyValue.Contains(s) || r.RowDataJson.Contains(s));
        }

        var total = await q.CountAsync();
        var records = await q
            .OrderByDescending(r => r.IsActive)
            .ThenBy(r => r.UniqueKeyValue)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var items = records.Select(r => new RecordItemDto
        {
            Id = r.Id,
            TableId = r.TableId,
            UniqueKeyValue = r.UniqueKeyValue,
            Data = DeserializeRow(r.RowDataJson),
            IsActive = r.IsActive,
            UpdatedAt = r.UpdatedAt
        }).ToList();

        return (items, total);
    }

    public async Task<RecordItemDto> AddRecordAsync(int tableId, RecordCreateUpdateDto dto)
    {
        var table = await _context.MasterDataTables.FindAsync(tableId)
            ?? throw new KeyNotFoundException($"جدول مرجع با شناسه {tableId} یافت نشد.");

        var key = dto.UniqueKeyValue.Trim();
        if (string.IsNullOrEmpty(key)) throw new InvalidOperationException("مقدار کلید یکتا نمی‌تواند خالی باشد.");

        var existing = await _context.MasterDataRecords
            .FirstOrDefaultAsync(r => r.TableId == tableId && r.UniqueKeyValue == key);

        var now = DateTime.UtcNow;
        var json = JsonSerializer.Serialize(dto.Data);

        MasterDataRecord rec;
        if (existing != null)
        {
            existing.RowDataJson = json;
            existing.IsActive = dto.IsActive;
            existing.UpdatedAt = now;
            rec = existing;
        }
        else
        {
            rec = new MasterDataRecord
            {
                TableId = tableId,
                UniqueKeyValue = key,
                RowDataJson = json,
                IsActive = dto.IsActive,
                UpdatedAt = now
            };
            _context.MasterDataRecords.Add(rec);
        }

        table.RecordCount = await _context.MasterDataRecords.CountAsync(r => r.TableId == tableId && r.IsActive);
        table.VersionHash = Guid.NewGuid().ToString("N");
        table.UpdatedAt = now;

        await _context.SaveChangesAsync();

        return new RecordItemDto
        {
            Id = rec.Id,
            TableId = rec.TableId,
            UniqueKeyValue = rec.UniqueKeyValue,
            Data = dto.Data,
            IsActive = rec.IsActive,
            UpdatedAt = rec.UpdatedAt
        };
    }

    public async Task<RecordItemDto> UpdateRecordAsync(int tableId, long recordId, RecordCreateUpdateDto dto)
    {
        var rec = await _context.MasterDataRecords
            .FirstOrDefaultAsync(r => r.Id == recordId && r.TableId == tableId)
            ?? throw new KeyNotFoundException("رکورد مورد نظر یافت نشد.");

        var key = dto.UniqueKeyValue.Trim();
        if (string.IsNullOrEmpty(key)) throw new InvalidOperationException("مقدار کلید یکتا نمی‌تواند خالی باشد.");

        rec.UniqueKeyValue = key;
        rec.RowDataJson = JsonSerializer.Serialize(dto.Data);
        rec.IsActive = dto.IsActive;
        rec.UpdatedAt = DateTime.UtcNow;

        var table = await _context.MasterDataTables.FindAsync(tableId);
        if (table != null)
        {
            table.VersionHash = Guid.NewGuid().ToString("N");
            table.UpdatedAt = DateTime.UtcNow;
            table.RecordCount = await _context.MasterDataRecords.CountAsync(r => r.TableId == tableId && r.IsActive);
        }

        await _context.SaveChangesAsync();

        return new RecordItemDto
        {
            Id = rec.Id,
            TableId = rec.TableId,
            UniqueKeyValue = rec.UniqueKeyValue,
            Data = dto.Data,
            IsActive = rec.IsActive,
            UpdatedAt = rec.UpdatedAt
        };
    }

    public async Task ToggleRecordStatusAsync(int tableId, long recordId)
    {
        var rec = await _context.MasterDataRecords
            .FirstOrDefaultAsync(r => r.Id == recordId && r.TableId == tableId)
            ?? throw new KeyNotFoundException("رکورد مورد نظر یافت نشد.");

        rec.IsActive = !rec.IsActive;
        rec.UpdatedAt = DateTime.UtcNow;

        var table = await _context.MasterDataTables.FindAsync(tableId);
        if (table != null)
        {
            table.VersionHash = Guid.NewGuid().ToString("N");
            table.UpdatedAt = DateTime.UtcNow;
            table.RecordCount = await _context.MasterDataRecords.CountAsync(r => r.TableId == tableId && r.IsActive);
        }

        await _context.SaveChangesAsync();
    }

    #endregion

    #region Helpers

    private static string BuildSqlConnectionString(string server, string database, string? authType, string? username, string? password)
    {
        var builder = new SqlConnectionStringBuilder
        {
            DataSource = server,
            InitialCatalog = database,
            TrustServerCertificate = true,
            ConnectTimeout = 10
        };

        if (string.Equals(authType, "Windows", StringComparison.OrdinalIgnoreCase))
        {
            builder.IntegratedSecurity = true;
        }
        else
        {
            builder.IntegratedSecurity = false;
            builder.UserID = username ?? string.Empty;
            builder.Password = password ?? string.Empty;
        }

        return builder.ConnectionString;
    }

    private static TableResponseDto MapToTableDto(MasterDataTable t)
    {
        return new TableResponseDto
        {
            Id = t.Id,
            Code = t.Code,
            Title = t.Title,
            SourceType = t.SourceType,
            ConnectionId = t.ConnectionId,
            ConnectionName = t.Connection?.Name,
            SqlQuery = t.SqlQuery,
            UniqueKeyColumn = t.UniqueKeyColumn,
            Columns = DeserializeColumns(t.ColumnsJson),
            SyncScheduleType = t.SyncScheduleType,
            SyncScheduleValue = t.SyncScheduleValue,
            ScheduleConfigJson = t.ScheduleConfigJson,
            NextRunAt = t.NextRunAt,
            FilterRulesJson = t.FilterRulesJson,
            ExcludedKeysJson = t.ExcludedKeysJson,
            LastSyncAt = t.LastSyncAt,
            LastSyncStatus = t.LastSyncStatus,
            LastSyncError = t.LastSyncError,
            RecordCount = t.RecordCount,
            VersionHash = t.VersionHash,
            IsActive = t.IsActive,
            CreatedAt = t.CreatedAt,
            UpdatedAt = t.UpdatedAt
        };
    }

    private static bool MatchesFilterRules(Dictionary<string, object?> row, List<FilterRuleDto> rules)
    {
        if (rules == null || rules.Count == 0) return true;

        foreach (var rule in rules)
        {
            if (string.IsNullOrWhiteSpace(rule.Column)) continue;

            string rowVal = "";
            if (row.TryGetValue(rule.Column, out var val) && val != null)
            {
                rowVal = val.ToString() ?? "";
            }
            else
            {
                var mk = row.Keys.FirstOrDefault(k => k.Equals(rule.Column, StringComparison.OrdinalIgnoreCase));
                if (mk != null && row[mk] != null) rowVal = row[mk]?.ToString() ?? "";
            }

            var op = (rule.Operator ?? "contains").Trim().ToLowerInvariant();
            var targetVal = (rule.Value ?? "").Trim();

            bool passed = op switch
            {
                "equals" => string.Equals(rowVal.Trim(), targetVal, StringComparison.OrdinalIgnoreCase),
                "not_equals" => !string.Equals(rowVal.Trim(), targetVal, StringComparison.OrdinalIgnoreCase),
                "contains" => rowVal.IndexOf(targetVal, StringComparison.OrdinalIgnoreCase) >= 0,
                "not_contains" => rowVal.IndexOf(targetVal, StringComparison.OrdinalIgnoreCase) < 0,
                "starts_with" => rowVal.StartsWith(targetVal, StringComparison.OrdinalIgnoreCase),
                "gt" => CompareValues(rowVal, targetVal) > 0,
                "lt" => CompareValues(rowVal, targetVal) < 0,
                "is_not_empty" => !string.IsNullOrWhiteSpace(rowVal),
                _ => true
            };

            if (!passed) return false;
        }

        return true;
    }

    private static int CompareValues(string actual, string target)
    {
        if (decimal.TryParse(actual, NumberStyles.Any, CultureInfo.InvariantCulture, out var aNum) &&
            decimal.TryParse(target, NumberStyles.Any, CultureInfo.InvariantCulture, out var tNum))
        {
            return aNum.CompareTo(tNum);
        }

        if (DateTime.TryParse(actual, CultureInfo.InvariantCulture, DateTimeStyles.None, out var aDate) &&
            DateTime.TryParse(target, CultureInfo.InvariantCulture, DateTimeStyles.None, out var tDate))
        {
            return aDate.CompareTo(tDate);
        }

        return string.Compare(actual, target, StringComparison.OrdinalIgnoreCase);
    }

    private static List<FilterRuleDto> DeserializeFilterRules(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<FilterRuleDto>();
        try
        {
            return JsonSerializer.Deserialize<List<FilterRuleDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<FilterRuleDto>();
        }
        catch
        {
            return new List<FilterRuleDto>();
        }
    }

    private static HashSet<string> DeserializeExcludedKeys(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return new HashSet<string>(list ?? new List<string>(), StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static List<TableColumnDef> DeserializeColumns(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<TableColumnDef>();
        try
        {
            return JsonSerializer.Deserialize<List<TableColumnDef>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<TableColumnDef>();
        }
        catch
        {
            return new List<TableColumnDef>();
        }
    }

    private static Dictionary<string, object?> DeserializeRow(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, object?>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
        catch
        {
            return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        }
    }

    #endregion
}
