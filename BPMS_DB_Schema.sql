-- ============================================================================
-- 🏛️ BPMS / BRMS Platform - اسکریپت جامع ایجاد پایگاه‌داده و جداول (SQL Server)
-- Database: BPMS_DB | Collation: Persian_100_CI_AI
-- ============================================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'BPMS_DB')
BEGIN
    CREATE DATABASE [BPMS_DB]
    COLLATE Persian_100_CI_AI;
END
GO

USE [BPMS_DB];
GO

-- ۱. جدول نقش‌های سامانه (AppRoles)
IF OBJECT_ID('dbo.AppRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppRoles (
        RoleID INT IDENTITY(1,1) PRIMARY KEY,
        RoleName NVARCHAR(50) NOT NULL UNIQUE,
        Description NVARCHAR(250) NULL,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME()
    );

    INSERT INTO dbo.AppRoles (RoleName, Description)
    VALUES 
    (N'Admin', N'مدیر کل سامانه با دسترسی کامل به تنظیمات، لاگ‌ها، لایسنس و تایید فرم‌ها'),
    (N'SuperUser', N'کاربر ارشد / طراح فرآیند با امکان طراحی فرم و مشاهده گزارش‌های اختصاصی'),
    (N'User', N'کاربر عادی سازمان جهت ثبت فرم‌ها، کارتابل ورودی و پیگیری درخواست‌ها');
END
GO

-- ۲. جدول کاربران سامانه (AppUsers - ترکیبی: اکتیو دایرکتوری و محلی)
IF OBJECT_ID('dbo.AppUsers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppUsers (
        UserID INT IDENTITY(1,1) PRIMARY KEY,
        Username NVARCHAR(100) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NULL,
        DisplayName NVARCHAR(150) NOT NULL,
        Email NVARCHAR(150) NULL,
        IsActiveDirectoryUser BIT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        AccessFailedCount INT NOT NULL DEFAULT 0,
        LockoutEnd DATETIME2 NULL,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
        LastLoginAt DATETIME2 NULL
    );
END
GO

-- ۳. جدول انتساب نقش‌ها به کاربران (AppUserRoles)
IF OBJECT_ID('dbo.AppUserRoles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AppUserRoles (
        UserID INT NOT NULL,
        RoleID INT NOT NULL,
        AssignedAt DATETIME2 DEFAULT SYSDATETIME(),
        PRIMARY KEY (UserID, RoleID),
        CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserID) REFERENCES dbo.AppUsers(UserID) ON DELETE CASCADE,
        CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleID) REFERENCES dbo.AppRoles(RoleID) ON DELETE CASCADE
    );
END
GO

-- ۴. جدول گروه‌های کاربری (UserGroups)
IF OBJECT_ID('dbo.UserGroups', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserGroups (
        GroupID INT IDENTITY(1,1) PRIMARY KEY,
        GroupName NVARCHAR(100) NOT NULL UNIQUE,
        Description NVARCHAR(250) NULL,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
END
GO

-- ۵. جدول اعضای گروه‌ها (UserGroupMembers)
IF OBJECT_ID('dbo.UserGroupMembers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserGroupMembers (
        GroupID INT NOT NULL,
        UserID INT NOT NULL,
        JoinedAt DATETIME2 DEFAULT SYSDATETIME(),
        PRIMARY KEY (GroupID, UserID),
        CONSTRAINT FK_GroupMembers_Group FOREIGN KEY (GroupID) REFERENCES dbo.UserGroups(GroupID) ON DELETE CASCADE,
        CONSTRAINT FK_GroupMembers_User FOREIGN KEY (UserID) REFERENCES dbo.AppUsers(UserID) ON DELETE CASCADE
    );
END
GO

-- ۶. جدول تعاریف و نسخه‌های فرم (Forms)
IF OBJECT_ID('dbo.Forms', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Forms (
        FormID INT IDENTITY(1,1) PRIMARY KEY,
        FormCode NVARCHAR(50) NOT NULL,
        Title NVARCHAR(150) NOT NULL,
        Description NVARCHAR(500) NULL,
        Tags NVARCHAR(250) NULL,
        Category NVARCHAR(100) NULL DEFAULT N'سازمانی',
        Version INT NOT NULL DEFAULT 1,
        Revision INT NOT NULL DEFAULT 0,
        Status NVARCHAR(30) NOT NULL DEFAULT N'Draft', -- Draft, PendingApproval, Active, Archived
        IsPublic BIT NOT NULL DEFAULT 0,
        PublicToken NVARCHAR(32) NULL,
        IsBiIntegrated BIT NOT NULL DEFAULT 0,
        SchemaJSON NVARCHAR(MAX) NOT NULL,
        CreatedByUserID INT NOT NULL,
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
        PublishedAt DATETIME2 NULL,
        CONSTRAINT FK_Forms_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES dbo.AppUsers(UserID),
        CONSTRAINT UQ_Form_Version UNIQUE (FormCode, Version, Revision)
    );
END
GO

-- ۷. جدول دسترسی گروه‌ها به فرم‌ها (FormGroupAccess)
IF OBJECT_ID('dbo.FormGroupAccess', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FormGroupAccess (
        FormID INT NOT NULL,
        GroupID INT NOT NULL,
        GrantedAt DATETIME2 DEFAULT SYSDATETIME(),
        PRIMARY KEY (FormID, GroupID),
        CONSTRAINT FK_FormAccess_Form FOREIGN KEY (FormID) REFERENCES dbo.Forms(FormID) ON DELETE CASCADE,
        CONSTRAINT FK_FormAccess_Group FOREIGN KEY (GroupID) REFERENCES dbo.UserGroups(GroupID) ON DELETE CASCADE
    );
END
GO

-- ۸. جدول درخواست‌ها و داده‌های ثبت‌شده (FormSubmissions)
IF OBJECT_ID('dbo.FormSubmissions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FormSubmissions (
        SubmissionID BIGINT IDENTITY(1,1) PRIMARY KEY,
        FormID INT NOT NULL,
        TrackingCode NVARCHAR(50) NOT NULL UNIQUE,
        DataJSON NVARCHAR(MAX) NOT NULL,
        WorkflowStatus NVARCHAR(250) NOT NULL DEFAULT N'Submitted', -- Submitted, PendingApproval, Completed, Rejected
        CurrentHandlerUserID INT NULL,
        CurrentStepIndex INT NOT NULL DEFAULT 0,
        SubmittedByUserID INT NULL,
        SubmittedAt DATETIME2 DEFAULT SYSDATETIME(),
        CompletedAt DATETIME2 NULL,
        DataHash VARCHAR(64) NULL,
        IsLocked BIT NOT NULL DEFAULT 0,
        CONSTRAINT FK_Submissions_Form FOREIGN KEY (FormID) REFERENCES dbo.Forms(FormID),
        CONSTRAINT FK_Submissions_Handler FOREIGN KEY (CurrentHandlerUserID) REFERENCES dbo.AppUsers(UserID),
        CONSTRAINT FK_Submissions_Submitter FOREIGN KEY (SubmittedByUserID) REFERENCES dbo.AppUsers(UserID)
    );
END
GO

-- ۹. جدول رونوشت‌های سازمانی (FormShares / CC)
IF OBJECT_ID('dbo.FormShares', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.FormShares (
        ShareID BIGINT IDENTITY(1,1) PRIMARY KEY,
        SubmissionID BIGINT NOT NULL,
        SharedWithUserID INT NOT NULL,
        SharedByUserID INT NOT NULL,
        SharedAt DATETIME2 DEFAULT SYSDATETIME(),
        IsRead BIT NOT NULL DEFAULT 0,
        CONSTRAINT FK_Shares_Submission FOREIGN KEY (SubmissionID) REFERENCES dbo.FormSubmissions(SubmissionID) ON DELETE CASCADE,
        CONSTRAINT FK_Shares_User FOREIGN KEY (SharedWithUserID) REFERENCES dbo.AppUsers(UserID),
        CONSTRAINT FK_Shares_By FOREIGN KEY (SharedByUserID) REFERENCES dbo.AppUsers(UserID)
    );
END
GO

-- ۱۰. جدول تاریخچه گردش‌کار (WorkflowHistory)
IF OBJECT_ID('dbo.WorkflowHistory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.WorkflowHistory (
        HistoryID BIGINT IDENTITY(1,1) PRIMARY KEY,
        SubmissionID BIGINT NOT NULL,
        ActionTaken NVARCHAR(50) NOT NULL, -- Submitted, Approved, Rejected, Delegated, Reassigned
        ActionByUserID INT NOT NULL,
        ActionAt DATETIME2 DEFAULT SYSDATETIME(),
        Comments NVARCHAR(1000) NULL,
        PreviousStatus NVARCHAR(250) NULL,
        NewStatus NVARCHAR(250) NOT NULL,
        CONSTRAINT FK_Workflow_Submission FOREIGN KEY (SubmissionID) REFERENCES dbo.FormSubmissions(SubmissionID) ON DELETE CASCADE,
        CONSTRAINT FK_Workflow_User FOREIGN KEY (ActionByUserID) REFERENCES dbo.AppUsers(UserID)
    );
END
GO

-- ۱۱. جدول ممیزی و لاگ‌های امنیتی (AuditLogs)
IF OBJECT_ID('dbo.AuditLogs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs (
        LogID BIGINT IDENTITY(1,1) PRIMARY KEY,
        UserID INT NULL,
        Username NVARCHAR(100) NULL,
        Action NVARCHAR(100) NOT NULL,
        EntityName NVARCHAR(100) NULL,
        EntityID NVARCHAR(50) NULL,
        IPAddress VARCHAR(50) NULL,
        UserAgent NVARCHAR(250) NULL,
        Details NVARCHAR(MAX) NULL,
        Timestamp DATETIME2 DEFAULT SYSDATETIME()
    );
END
GO

-- ۱۲. جدول تنظیمات هوش مصنوعی (AiConfigurations)
IF OBJECT_ID('dbo.AiConfigurations', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AiConfigurations (
        ConfigID INT IDENTITY(1,1) PRIMARY KEY,
        Provider NVARCHAR(100) NOT NULL DEFAULT N'OpenAI-Compatible',
        BaseUrl NVARCHAR(255) NOT NULL,
        ApiKey NVARCHAR(500) NULL,
        ModelName NVARCHAR(100) NOT NULL DEFAULT N'gpt-4o-mini',
        Temperature FLOAT NOT NULL DEFAULT 0.2,
        MaxTokens INT NOT NULL DEFAULT 2000,
        IsEnabled BIT NOT NULL DEFAULT 1,
        SystemPrompt NVARCHAR(MAX) NULL,
        UpdatedAt DATETIME2 DEFAULT SYSDATETIME(),
        UpdatedByUserID INT NULL,
        CONSTRAINT FK_AiConfig_UpdatedByUser FOREIGN KEY (UpdatedByUserID) REFERENCES dbo.AppUsers(UserID)
    );
END
ELSE
BEGIN
    -- همگام‌سازی ساختار جدول در صورت وجود ساختار قبلی
    IF COL_LENGTH('dbo.AiConfigurations', 'ProviderName') IS NOT NULL AND COL_LENGTH('dbo.AiConfigurations', 'Provider') IS NULL
        EXEC sp_rename 'dbo.AiConfigurations.ProviderName', 'Provider', 'COLUMN';
    IF COL_LENGTH('dbo.AiConfigurations', 'IsActive') IS NOT NULL AND COL_LENGTH('dbo.AiConfigurations', 'IsEnabled') IS NULL
        EXEC sp_rename 'dbo.AiConfigurations.IsActive', 'IsEnabled', 'COLUMN';
    IF COL_LENGTH('dbo.AiConfigurations', 'CreatedAt') IS NOT NULL AND COL_LENGTH('dbo.AiConfigurations', 'UpdatedAt') IS NULL
        EXEC sp_rename 'dbo.AiConfigurations.CreatedAt', 'UpdatedAt', 'COLUMN';
    IF COL_LENGTH('dbo.AiConfigurations', 'UpdatedByUserID') IS NULL
        ALTER TABLE dbo.AiConfigurations ADD UpdatedByUserID INT NULL;
END
GO

-- ۱۳. جدول کلید-مقدار تنظیمات پویا (SystemSettings)
IF OBJECT_ID('dbo.SystemSettings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SystemSettings (
        SettingKey NVARCHAR(100) PRIMARY KEY,
        SettingValue NVARCHAR(MAX) NOT NULL,
        UpdatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
END
GO

-- ۱۴. کاربر مدیر محلی اولیه (local_admin با رمز عبور اولیه Admin@123456)
IF NOT EXISTS (SELECT 1 FROM dbo.AppUsers WHERE Username = N'local_admin')
BEGIN
    -- هش PBKDF2-SHA256 رمز عبور Admin@123456
    INSERT INTO dbo.AppUsers (Username, PasswordHash, DisplayName, Email, IsActiveDirectoryUser, IsActive, CreatedAt)
    VALUES (N'local_admin', N'v1$100000$64$kLqYI9Xp02i/mFqA3YvL7zP8k9s=$/+3jDkLmP8Q=', N'مدیر کل سیستم', N'admin@spkh.local', 0, 1, SYSDATETIME());
    
    DECLARE @NewAdminUserID INT = SCOPE_IDENTITY();
    DECLARE @AdminRoleID INT = (SELECT TOP 1 RoleID FROM dbo.AppRoles WHERE RoleName = N'Admin');
    
    IF @AdminRoleID IS NOT NULL
    BEGIN
        INSERT INTO dbo.AppUserRoles (UserID, RoleID) VALUES (@NewAdminUserID, @AdminRoleID);
    END
END
GO

-- ۱۵. جدول اتصالات داده‌های مرجع (MasterDataConnections)
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
        CreatedAt DATETIME2 DEFAULT SYSDATETIME()
    );
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.MasterDataConnections') AND name = 'AuthType')
    BEGIN
        ALTER TABLE dbo.MasterDataConnections ADD AuthType NVARCHAR(50) NOT NULL DEFAULT 'Sql';
    END
    ALTER TABLE dbo.MasterDataConnections ALTER COLUMN Username NVARCHAR(150) NULL;
END
GO

-- ۱۶. جدول جداول مرجع (MasterDataTables)
IF OBJECT_ID('dbo.MasterDataTables', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MasterDataTables (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Code NVARCHAR(50) NOT NULL UNIQUE,
        Title NVARCHAR(150) NOT NULL,
        SourceType NVARCHAR(50) NOT NULL DEFAULT N'Manual', -- Manual, Excel, SqlQuery
        ConnectionId INT NULL,
        SqlQuery NVARCHAR(MAX) NULL,
        UniqueKeyColumn NVARCHAR(100) NOT NULL,
        ColumnsJson NVARCHAR(MAX) NOT NULL,
        SyncScheduleType NVARCHAR(50) NOT NULL DEFAULT N'None', -- None, IntervalMinutes, DailyTime
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
        CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
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
END
GO

-- ۱۷. جدول رکوردهای داده‌های مرجع (MasterDataRecords)
IF OBJECT_ID('dbo.MasterDataRecords', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MasterDataRecords (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        TableId INT NOT NULL,
        UniqueKeyValue NVARCHAR(250) NOT NULL,
        RowDataJson NVARCHAR(MAX) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        UpdatedAt DATETIME2 DEFAULT SYSDATETIME(),
        CONSTRAINT FK_MasterDataRecords_Table FOREIGN KEY (TableId) REFERENCES dbo.MasterDataTables(Id) ON DELETE CASCADE
    );
END
GO

IF OBJECT_ID('dbo.MasterDataRecords', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.MasterDataRecords') AND name = 'IX_MasterDataRecords_Lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_MasterDataRecords_Lookup ON dbo.MasterDataRecords (TableId, IsActive, UniqueKeyValue);
END
GO

-- ۱۸. جدول اشتراک‌گذاری فرم‌ها بین کاربران ارشد و انتقال دسترسی (FormDefinitionShares)
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
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT FK_FormDefShares_SharedWith FOREIGN KEY (SharedWithUserId) REFERENCES dbo.AppUsers(UserID) ON DELETE CASCADE,
        CONSTRAINT FK_FormDefShares_SharedBy FOREIGN KEY (SharedByUserId) REFERENCES dbo.AppUsers(UserID)
    );
END
GO

IF OBJECT_ID('dbo.FormDefinitionShares', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.FormDefinitionShares') AND name = 'IX_FormDefinitionShares_Lookup')
BEGIN
    CREATE NONCLUSTERED INDEX IX_FormDefinitionShares_Lookup ON dbo.FormDefinitionShares (FormKey, SharedWithUserId);
END
GO
