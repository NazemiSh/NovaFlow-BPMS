using System.Data;
using System.Linq;
using BPMS.Server.Services;
using Microsoft.Data.SqlClient;

namespace BPMS.Server.Data;

/// <summary>
/// DB initialization / seeding scripts.
/// </summary>
public static class SeedDb
{
    private const string DefaultDbConn = "Server=localhost;Database=BPMS_DB;User Id=bpms_app_user;Password=ChangeMe;TrustServerCertificate=True;";
    private const string AdminUsername = "local_admin";
    private const string AdminPassword = "Admin@123456";

    /// <summary>
    /// Ensures base roles (Admin, SuperUser, User) exist and 'local_admin' exists in BPMS_DB
    /// with a PBKDF2-SHA256 hash of the admin password, assigned to the 'Admin' role.
    /// Returns the computed hash.
    /// </summary>
    public static async Task<(bool Created, string Hash)> SeedLocalAdminAsync(string? connectionString = null, CancellationToken ct = default)
    {
        var hasher = new PasswordHasher();
        var hash = hasher.HashPassword(AdminPassword);

        var actualConn = !string.IsNullOrWhiteSpace(connectionString) ? connectionString : DefaultDbConn;
        using var conn = new SqlConnection(actualConn);
        await conn.OpenAsync(ct);

        // 0. Ensure schema migrations/columns exist
        await EnsureSchemaUpgradesInternalAsync(conn, ct);

        // 1. Ensure default base roles exist
        var ensureRolesSql = @"
            IF NOT EXISTS (SELECT 1 FROM dbo.AppRoles WHERE RoleName = 'Admin')
                INSERT INTO dbo.AppRoles (RoleName, Description, CreatedAt)
                VALUES (N'Admin', N'مدیر کل سامانه با دسترسی کامل به تنظیمات، لاگ‌ها، لایسنس و تایید فرم‌ها', GETUTCDATE());

            IF NOT EXISTS (SELECT 1 FROM dbo.AppRoles WHERE RoleName = 'SuperUser')
                INSERT INTO dbo.AppRoles (RoleName, Description, CreatedAt)
                VALUES (N'SuperUser', N'کاربر ارشد / طراح فرآیند با امکان طراحی فرم و مشاهده گزارش‌های اختصاصی', GETUTCDATE());

            IF NOT EXISTS (SELECT 1 FROM dbo.AppRoles WHERE RoleName = 'User')
                INSERT INTO dbo.AppRoles (RoleName, Description, CreatedAt)
                VALUES (N'User', N'کاربر عادی سازمان جهت ثبت فرم‌ها، کارتابل ورودی و پیگیری درخواست‌ها', GETUTCDATE());
        ";
        using (var rolesCmd = new SqlCommand(ensureRolesSql, conn))
        {
            await rolesCmd.ExecuteNonQueryAsync(ct);
        }

        // 2. Upsert local_admin user
        var upsertUserSql = @"
            DECLARE @UserID int;
            SELECT @UserID = UserID FROM dbo.AppUsers WHERE Username = @Username;

            IF @UserID IS NULL
            BEGIN
                INSERT INTO dbo.AppUsers (Username, PasswordHash, DisplayName, Email, IsActiveDirectoryUser, IsActive, CreatedAt)
                VALUES (@Username, @PasswordHash, N'مدیر کل سیستم', NULL, 0, 1, GETUTCDATE());
                SET @UserID = CAST(SCOPE_IDENTITY() AS int);
            END
            ELSE
            BEGIN
                UPDATE dbo.AppUsers
                SET PasswordHash = CASE WHEN PasswordHash IS NULL OR PasswordHash = '' THEN @PasswordHash ELSE PasswordHash END,
                    DisplayName = CASE WHEN DisplayName IS NULL OR DisplayName = '' THEN N'مدیر کل سیستم' ELSE DisplayName END,
                    Email = CASE WHEN Email = N'admin@spkh.local' THEN NULL ELSE Email END,
                    IsActive = 1
                WHERE UserID = @UserID;
            END;

            SELECT @UserID;";

        int userId;
        using (var userCmd = new SqlCommand(upsertUserSql, conn))
        {
            userCmd.Parameters.Add("@Username", SqlDbType.NVarChar, 100).Value = AdminUsername;
            userCmd.Parameters.Add("@PasswordHash", SqlDbType.NVarChar, -1).Value = hash;

            var scalar = await userCmd.ExecuteScalarAsync(ct);
            if (scalar == null || scalar == DBNull.Value)
                throw new InvalidOperationException("Failed to determine local_admin UserID.");
            userId = Convert.ToInt32(scalar);
        }

        // 3. Assign 'Admin' role to local_admin
        var assignRoleSql = @"
            DECLARE @AdminRoleID int;
            SELECT TOP 1 @AdminRoleID = RoleID FROM dbo.AppRoles WHERE RoleName = 'Admin';
            IF @AdminRoleID IS NULL
                SELECT TOP 1 @AdminRoleID = RoleID FROM dbo.AppRoles WHERE RoleName = 'Administrator';

            IF @AdminRoleID IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.AppUserRoles WHERE UserID = @UserID AND RoleID = @AdminRoleID)
            BEGIN
                INSERT INTO dbo.AppUserRoles (UserID, RoleID, AssignedAt)
                VALUES (@UserID, @AdminRoleID, GETUTCDATE());
            END;";

        using (var roleCmd = new SqlCommand(assignRoleSql, conn))
        {
            roleCmd.Parameters.Add("@UserID", SqlDbType.Int).Value = userId;
            await roleCmd.ExecuteNonQueryAsync(ct);
        }

        return (true, hash);
    }

    /// <summary>
    /// Ensures database columns and schema upgrades exist idempotently.
    /// </summary>
    public static async Task EnsureSchemaUpgradesAsync(string? connectionString = null, CancellationToken ct = default)
    {
        var actualConn = !string.IsNullOrWhiteSpace(connectionString) ? connectionString : DefaultDbConn;
        using var conn = new SqlConnection(actualConn);
        await conn.OpenAsync(ct);
        await EnsureSchemaUpgradesInternalAsync(conn, ct);
    }

    private static async Task EnsureSchemaUpgradesInternalAsync(SqlConnection conn, CancellationToken ct)
    {
        // 1. Ensure PublicToken in dbo.Forms via dynamic SQL and separate command
        var addPublicTokenSql = @"
            IF OBJECT_ID('dbo.Forms', 'U') IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Forms') AND name = 'PublicToken')
                BEGIN
                    EXEC(N'ALTER TABLE dbo.Forms ADD PublicToken NVARCHAR(32) NULL;');
                END
            END";
        using (var cmd = new SqlCommand(addPublicTokenSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 2. Fill PublicToken for existing forms where it is NULL (separate command & dynamic SQL)
        var fillPublicTokenSql = @"
            IF OBJECT_ID('dbo.Forms', 'U') IS NOT NULL
               AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Forms') AND name = 'PublicToken')
            BEGIN
                EXEC(N'UPDATE dbo.Forms SET PublicToken = LOWER(SUBSTRING(CONVERT(VARCHAR(40), NEWID()), 1, 10)) WHERE PublicToken IS NULL OR PublicToken = ''''');
            END";
        using (var cmd = new SqlCommand(fillPublicTokenSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 3. Ensure AccessFailedCount in dbo.AppUsers
        var addAccessFailedCountSql = @"
            IF OBJECT_ID('dbo.AppUsers', 'U') IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AppUsers') AND name = 'AccessFailedCount')
                BEGIN
                    EXEC(N'ALTER TABLE dbo.AppUsers ADD AccessFailedCount INT NOT NULL CONSTRAINT DF_AppUsers_AccessFailedCount DEFAULT 0;');
                END
            END";
        using (var cmd = new SqlCommand(addAccessFailedCountSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 4. Ensure LockoutEnd in dbo.AppUsers
        var addLockoutEndSql = @"
            IF OBJECT_ID('dbo.AppUsers', 'U') IS NOT NULL
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.AppUsers') AND name = 'LockoutEnd')
                BEGIN
                    EXEC(N'ALTER TABLE dbo.AppUsers ADD LockoutEnd DATETIME2 NULL;');
                END
            END";
        using (var cmd = new SqlCommand(addLockoutEndSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 5. Ensure non-clustered index on PublicToken for fast lookup
        var addPublicTokenIndexSql = @"
            IF OBJECT_ID('dbo.Forms', 'U') IS NOT NULL
               AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Forms') AND name = 'PublicToken')
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Forms') AND name = 'IX_Forms_PublicToken')
            BEGIN
                EXEC(N'CREATE NONCLUSTERED INDEX IX_Forms_PublicToken ON dbo.Forms(PublicToken) WHERE PublicToken IS NOT NULL;');
            END";
        using (var cmd = new SqlCommand(addPublicTokenIndexSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 6. Clear invalid / dummy email for local_admin or admin@spkh.local
        var clearLocalAdminEmailSql = @"
            IF OBJECT_ID('dbo.AppUsers', 'U') IS NOT NULL
            BEGIN
                UPDATE dbo.AppUsers
                SET Email = NULL
                WHERE Username = N'local_admin' OR Email = N'admin@spkh.local';
            END";
        using (var cmd = new SqlCommand(clearLocalAdminEmailSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 7. Ensure CurrentStepIndex in dbo.FormSubmissions
        var addCurrentStepIndexSql = @"
            IF OBJECT_ID('dbo.FormSubmissions', 'U') IS NOT NULL
            BEGIN
                IF COL_LENGTH('dbo.FormSubmissions', 'CurrentStepIndex') IS NULL
                BEGIN
                    EXEC(N'ALTER TABLE dbo.FormSubmissions ADD CurrentStepIndex INT NOT NULL CONSTRAINT DF_FormSubmissions_CurrentStepIndex DEFAULT(0);');
                END
            END";
        using (var cmd = new SqlCommand(addCurrentStepIndexSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 8. Ensure Category in dbo.Forms
        var addCategorySql = @"
            IF OBJECT_ID('dbo.Forms', 'U') IS NOT NULL
            BEGIN
                IF COL_LENGTH('dbo.Forms', 'Category') IS NULL
                BEGIN
                    EXEC(N'ALTER TABLE dbo.Forms ADD Category NVARCHAR(100) NULL;');
                END
            END";
        using (var cmd = new SqlCommand(addCategorySql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 9. Upgrade WorkflowStatus in dbo.FormSubmissions to NVARCHAR(250)
        var upgradeWorkflowStatusSql = @"
            IF OBJECT_ID('dbo.FormSubmissions', 'U') IS NOT NULL
            BEGIN
                IF COL_LENGTH('dbo.FormSubmissions', 'WorkflowStatus') IS NOT NULL 
                   AND COL_LENGTH('dbo.FormSubmissions', 'WorkflowStatus') < 500
                BEGIN
                    EXEC(N'ALTER TABLE dbo.FormSubmissions ALTER COLUMN WorkflowStatus NVARCHAR(250) NOT NULL;');
                END
            END";
        using (var cmd = new SqlCommand(upgradeWorkflowStatusSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 10. Upgrade PreviousStatus and NewStatus in dbo.WorkflowHistory to NVARCHAR(250)
        var upgradeWorkflowHistorySql = @"
            IF OBJECT_ID('dbo.WorkflowHistory', 'U') IS NOT NULL
            BEGIN
                IF COL_LENGTH('dbo.WorkflowHistory', 'PreviousStatus') IS NOT NULL 
                   AND COL_LENGTH('dbo.WorkflowHistory', 'PreviousStatus') < 500
                BEGIN
                    EXEC(N'ALTER TABLE dbo.WorkflowHistory ALTER COLUMN PreviousStatus NVARCHAR(250) NULL;');
                END

                IF COL_LENGTH('dbo.WorkflowHistory', 'NewStatus') IS NOT NULL 
                   AND COL_LENGTH('dbo.WorkflowHistory', 'NewStatus') < 500
                BEGIN
                    EXEC(N'ALTER TABLE dbo.WorkflowHistory ALTER COLUMN NewStatus NVARCHAR(250) NOT NULL;');
                END
            END";
        using (var cmd = new SqlCommand(upgradeWorkflowHistorySql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 11. Ensure MasterDataConnections table
        var ensureMasterDataConnectionsSql = @"
            IF OBJECT_ID('dbo.MasterDataConnections', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.MasterDataConnections (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Name NVARCHAR(150) NOT NULL,
                    ServerAddress NVARCHAR(250) NOT NULL,
                    DatabaseName NVARCHAR(150) NOT NULL,
                    AuthType NVARCHAR(50) NOT NULL DEFAULT 'Sql',
                    Username NVARCHAR(150) NULL,
                    EncryptedPassword NVARCHAR(MAX) NULL,
                    IsActive BIT NOT NULL DEFAULT 1,
                    CreatedAt DATETIME2 DEFAULT GETUTCDATE()
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataConnections') AND name = 'AuthType')
                BEGIN
                    ALTER TABLE dbo.MasterDataConnections ADD AuthType NVARCHAR(50) NOT NULL DEFAULT 'Sql';
                END
                ALTER TABLE dbo.MasterDataConnections ALTER COLUMN Username NVARCHAR(150) NULL;
            END";
        using (var cmd = new SqlCommand(ensureMasterDataConnectionsSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 12. Ensure MasterDataTables table
        var ensureMasterDataTablesSql = @"
            IF OBJECT_ID('dbo.MasterDataTables', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.MasterDataTables (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Code NVARCHAR(50) NOT NULL UNIQUE,
                    Title NVARCHAR(150) NOT NULL,
                    SourceType NVARCHAR(50) NOT NULL DEFAULT N'Manual',
                    ConnectionId INT NULL,
                    SqlQuery NVARCHAR(MAX) NULL,
                    UniqueKeyColumn NVARCHAR(100) NOT NULL,
                    ColumnsJson NVARCHAR(MAX) NOT NULL,
                    SyncScheduleType NVARCHAR(50) NOT NULL DEFAULT N'None',
                    SyncScheduleValue NVARCHAR(100) NULL,
                    ScheduleConfigJson NVARCHAR(MAX) NULL,
                    NextRunAt DATETIME2 NULL,
                    FilterRulesJson NVARCHAR(MAX) NULL,
                    ExcludedKeysJson NVARCHAR(MAX) NULL,
                    LastSyncAt DATETIME2 NULL,
                    LastSyncStatus NVARCHAR(50) NULL,
                    LastSyncError NVARCHAR(MAX) NULL,
                    RecordCount INT NOT NULL DEFAULT 0,
                    VersionHash NVARCHAR(64) NULL,
                    IsActive BIT NOT NULL DEFAULT 1,
                    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
                    UpdatedAt DATETIME2 NULL,
                    CONSTRAINT FK_MasterDataTables_Connection FOREIGN KEY (ConnectionId) REFERENCES dbo.MasterDataConnections(Id) ON DELETE SET NULL
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataTables') AND name = 'ScheduleConfigJson')
                BEGIN
                    ALTER TABLE dbo.MasterDataTables ADD ScheduleConfigJson NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataTables') AND name = 'NextRunAt')
                BEGIN
                    ALTER TABLE dbo.MasterDataTables ADD NextRunAt DATETIME2 NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataTables') AND name = 'FilterRulesJson')
                BEGIN
                    ALTER TABLE dbo.MasterDataTables ADD FilterRulesJson NVARCHAR(MAX) NULL;
                END
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataTables') AND name = 'ExcludedKeysJson')
                BEGIN
                    ALTER TABLE dbo.MasterDataTables ADD ExcludedKeysJson NVARCHAR(MAX) NULL;
                END
            END";
        using (var cmd = new SqlCommand(ensureMasterDataTablesSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 13. Ensure MasterDataRecords table and lookup index
        var ensureMasterDataRecordsSql = @"
            IF OBJECT_ID('dbo.MasterDataRecords', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.MasterDataRecords (
                    Id BIGINT IDENTITY(1,1) PRIMARY KEY,
                    TableId INT NOT NULL,
                    UniqueKeyValue NVARCHAR(250) NOT NULL,
                    RowDataJson NVARCHAR(MAX) NOT NULL,
                    IsActive BIT NOT NULL DEFAULT 1,
                    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
                    CONSTRAINT FK_MasterDataRecords_Table FOREIGN KEY (TableId) REFERENCES dbo.MasterDataTables(Id) ON DELETE CASCADE
                );
            END

            IF OBJECT_ID('dbo.MasterDataRecords', 'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.MasterDataRecords') AND name = 'IX_MasterDataRecords_Lookup')
            BEGIN
                CREATE NONCLUSTERED INDEX IX_MasterDataRecords_Lookup ON dbo.MasterDataRecords (TableId, IsActive, UniqueKeyValue);
            END";
        using (var cmd = new SqlCommand(ensureMasterDataRecordsSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }

        // 14. Ensure FormDefinitionShares table for sharing forms between superusers
        var ensureFormDefinitionSharesSql = @"
            IF OBJECT_ID('dbo.FormDefinitionShares', 'U') IS NULL
            BEGIN
                CREATE TABLE dbo.FormDefinitionShares (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    FormKey NVARCHAR(100) NOT NULL,
                    FormId INT NULL,
                    SharedWithUserId INT NOT NULL,
                    CanEditDesign BIT NOT NULL DEFAULT 0,
                    CanViewReports BIT NOT NULL DEFAULT 0,
                    SharedByUserId INT NOT NULL,
                    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
                    CONSTRAINT FK_FormDefShares_SharedWith FOREIGN KEY (SharedWithUserId) REFERENCES dbo.AppUsers(UserID) ON DELETE CASCADE,
                    CONSTRAINT FK_FormDefShares_SharedBy FOREIGN KEY (SharedByUserId) REFERENCES dbo.AppUsers(UserID)
                );
            END

            IF OBJECT_ID('dbo.FormDefinitionShares', 'U') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.FormDefinitionShares') AND name = 'IX_FormDefinitionShares_Lookup')
            BEGIN
                CREATE NONCLUSTERED INDEX IX_FormDefinitionShares_Lookup ON dbo.FormDefinitionShares (FormKey, SharedWithUserId);
            END";
        using (var cmd = new SqlCommand(ensureFormDefinitionSharesSql, conn))
        {
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }
}
