using BPMS.Server.Models;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Data;

/// <summary>
/// EF Core DbContext mapped to the existing BPMS_DB schema.
/// </summary>
public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    protected ApplicationDbContext(DbContextOptions options)
        : base(options)
    {
    }

    public DbSet<UserGroup> UserGroups => Set<UserGroup>();
    public DbSet<UserGroupMember> UserGroupMembers => Set<UserGroupMember>();
    public DbSet<FormGroupAccess> FormGroupAccesses => Set<FormGroupAccess>();
    public DbSet<AiConfiguration> AiConfigurations => Set<AiConfiguration>();
    public DbSet<AppRole> AppRoles => Set<AppRole>();
    public DbSet<AppUser> AppUsers => Set<AppUser>();
    public DbSet<AppUserRole> AppUserRoles => Set<AppUserRole>();
    public DbSet<FormDefinition> Forms => Set<FormDefinition>();
    public DbSet<FormSubmission> FormSubmissions => Set<FormSubmission>();
    public DbSet<FormShare> FormShares => Set<FormShare>();
    public DbSet<FormDefinitionShare> FormDefinitionShares => Set<FormDefinitionShare>();
    public DbSet<WorkflowHistory> WorkflowHistory => Set<WorkflowHistory>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<MasterDataConnection> MasterDataConnections => Set<MasterDataConnection>();
    public DbSet<MasterDataTable> MasterDataTables => Set<MasterDataTable>();
    public DbSet<MasterDataRecord> MasterDataRecords => Set<MasterDataRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // ---------- AppRole ----------
        modelBuilder.Entity<AppRole>(entity =>
        {
            entity.ToTable("AppRoles", "dbo");
            entity.HasIndex(r => r.RoleName).IsUnique();
        });

        // ---------- AppUser ----------
        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("AppUsers", "dbo");
            entity.HasIndex(u => u.Username).IsUnique();
        });

        // ---------- AppUserRole: composite key (UserID, RoleID) ----------
        modelBuilder.Entity<AppUserRole>(entity =>
        {
            entity.ToTable("AppUserRoles", "dbo");
            entity.HasKey(ur => new { ur.UserID, ur.RoleID });

            entity.HasOne(ur => ur.User)
                  .WithMany(u => u.UserRoles)
                  .HasForeignKey(ur => ur.UserID)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ur => ur.Role)
                  .WithMany(r => r.UserRoles)
                  .HasForeignKey(ur => ur.RoleID)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---------- UserGroups ----------
        modelBuilder.Entity<UserGroup>(entity =>
        {
            entity.ToTable("UserGroups", "dbo");
            entity.HasIndex(g => g.GroupName).IsUnique();
        });

        // ---------- UserGroupMembers: composite key (GroupID, UserID) ----------
        modelBuilder.Entity<UserGroupMember>(entity =>
        {
            entity.ToTable("UserGroupMembers", "dbo");
            entity.HasKey(ugm => new { ugm.GroupID, ugm.UserID });

            entity.HasOne(ugm => ugm.Group)
                  .WithMany(g => g.Members)
                  .HasForeignKey(ugm => ugm.GroupID)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ugm => ugm.User)
                  .WithMany()
                  .HasForeignKey(ugm => ugm.UserID)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---------- FormGroupAccess: composite key (FormID, GroupID) ----------
        modelBuilder.Entity<FormGroupAccess>(entity =>
        {
            entity.ToTable("FormGroupAccess", "dbo");
            entity.HasKey(fga => new { fga.FormID, fga.GroupID });

            entity.HasOne(fga => fga.Form)
                  .WithMany()
                  .HasForeignKey(fga => fga.FormID)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(fga => fga.Group)
                  .WithMany(g => g.FormAccesses)
                  .HasForeignKey(fga => fga.GroupID)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ---------- FormDefinition (Forms) ----------
        modelBuilder.Entity<FormDefinition>(entity =>
        {
            entity.ToTable("Forms", "dbo");
            entity.HasIndex(f => new { f.FormCode, f.Version, f.Revision }).IsUnique();
            entity.Property(f => f.Status).HasMaxLength(30).HasDefaultValue("Draft");
            entity.Property(f => f.Version).HasDefaultValue(1);
            entity.Property(f => f.Revision).HasDefaultValue(0);
            entity.Property(f => f.Category).HasMaxLength(100).HasDefaultValue("سازمانی");

            entity.HasOne(f => f.CreatedByUser)
                  .WithMany()
                  .HasForeignKey(f => f.CreatedByUserID)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- FormSubmission (FormSubmissions) ----------
        modelBuilder.Entity<FormSubmission>(entity =>
        {
            entity.ToTable("FormSubmissions", "dbo");
            entity.HasIndex(s => s.TrackingCode).IsUnique();
            entity.Property(s => s.WorkflowStatus).HasMaxLength(250).HasDefaultValue("Submitted");
            entity.Property(s => s.CurrentStepIndex).HasDefaultValue(0);

            entity.HasOne(s => s.Form)
                  .WithMany()
                  .HasForeignKey(s => s.FormID)
                  .OnDelete(DeleteBehavior.Restrict);

            // Optional navigations to AppUser - NoAction avoids multiple cascade paths.
            entity.HasOne(s => s.CurrentHandlerUser)
                  .WithMany()
                  .HasForeignKey(s => s.CurrentHandlerUserID)
                  .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(s => s.SubmittedByUser)
                  .WithMany()
                  .HasForeignKey(s => s.SubmittedByUserID)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- FormShare (FormShares) ----------
        modelBuilder.Entity<FormShare>(entity =>
        {
            entity.ToTable("FormShares", "dbo");

            entity.HasOne(s => s.Submission)
                  .WithMany()
                  .HasForeignKey(s => s.SubmissionID)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.SharedWithUser)
                  .WithMany()
                  .HasForeignKey(s => s.SharedWithUserID)
                  .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(s => s.SharedByUser)
                  .WithMany()
                  .HasForeignKey(s => s.SharedByUserID)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- FormDefinitionShare (FormDefinitionShares) ----------
        modelBuilder.Entity<FormDefinitionShare>(entity =>
        {
            entity.ToTable("FormDefinitionShares", "dbo");
            entity.HasKey(s => s.Id);
            entity.Property(s => s.FormKey).HasMaxLength(100).IsRequired();

            entity.HasOne(s => s.SharedWithUser)
                  .WithMany()
                  .HasForeignKey(s => s.SharedWithUserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.SharedByUser)
                  .WithMany()
                  .HasForeignKey(s => s.SharedByUserId)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- WorkflowHistory ----------
        modelBuilder.Entity<WorkflowHistory>(entity =>
        {
            entity.ToTable("WorkflowHistory", "dbo");
            entity.Property(h => h.PreviousStatus).HasMaxLength(250);
            entity.Property(h => h.NewStatus).HasMaxLength(250);

            entity.HasOne(h => h.Submission)
                  .WithMany()
                  .HasForeignKey(h => h.SubmissionID)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(h => h.ActionByUser)
                  .WithMany()
                  .HasForeignKey(h => h.ActionByUserID)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- AuditLog ----------
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("AuditLogs", "dbo");
            // UserID is a loose reference (nullable, no enforced FK) matching the existing schema.
            entity.Property(a => a.Details).HasColumnType("nvarchar(max)");
        });

        // ---------- AiConfigurations ----------
        modelBuilder.Entity<AiConfiguration>(entity =>
        {
            entity.ToTable("AiConfigurations", "dbo");
            entity.HasOne<AppUser>()
                  .WithMany()
                  .HasForeignKey(c => c.UpdatedByUserID)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        // ---------- SystemSetting ----------
        modelBuilder.Entity<SystemSetting>().ToTable("SystemSettings", "dbo");

        // ---------- MasterDataConnections ----------
        modelBuilder.Entity<MasterDataConnection>(entity =>
        {
            entity.ToTable("MasterDataConnections", "dbo");
        });

        // ---------- MasterDataTables ----------
        modelBuilder.Entity<MasterDataTable>(entity =>
        {
            entity.ToTable("MasterDataTables", "dbo");
            entity.HasIndex(t => t.Code).IsUnique();

            entity.HasOne(t => t.Connection)
                  .WithMany(c => c.Tables)
                  .HasForeignKey(t => t.ConnectionId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        // ---------- MasterDataRecords ----------
        modelBuilder.Entity<MasterDataRecord>(entity =>
        {
            entity.ToTable("MasterDataRecords", "dbo");
            entity.HasIndex(r => new { r.TableId, r.IsActive, r.UniqueKeyValue })
                  .HasDatabaseName("IX_MasterDataRecords_Lookup");

            entity.HasOne(r => r.Table)
                  .WithMany(t => t.Records)
                  .HasForeignKey(r => r.TableId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

/// <summary>
/// Alias / subclass of ApplicationDbContext for explicit BPMS domain context access.
/// </summary>
public class BpmsDbContext : ApplicationDbContext
{
    public BpmsDbContext(DbContextOptions<BpmsDbContext> options)
        : base(options)
    {
    }

    public BpmsDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }
}
