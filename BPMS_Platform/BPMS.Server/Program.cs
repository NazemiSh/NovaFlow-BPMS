using System.Linq;
using System.Security.Claims;
using System.Text;
using BPMS.Server.Data;
using BPMS.Server.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddHttpClient();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<ILicenseService, LicenseService>();
builder.Services.AddScoped<PasswordHasher>();
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<ILdapService, LdapService>();
builder.Services.AddScoped<IFormService, FormService>();
builder.Services.AddScoped<IWorkflowService, WorkflowService>();
builder.Services.AddScoped<IBackupService, BackupService>();
builder.Services.AddScoped<IMasterDataService, MasterDataService>();
builder.Services.AddScoped<ISecurityPolicyService, SecurityPolicyService>();
builder.Services.AddHostedService<BackupSchedulerService>();
builder.Services.AddHostedService<LicenseHeartbeatService>();
builder.Services.AddHostedService<MasterDataSyncHostedService>();

// JWT configuration
var jwtSecret = builder.Configuration["Jwt:SecretKey"] ?? throw new InvalidOperationException("Jwt:SecretKey is missing");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidateAudience = true,
        ValidAudience = builder.Configuration["Jwt:Audience"],
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token.",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Register EF Core DbContext with the BPMS_DB connection string.
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("BPMS_DB")));

// Register BpmsDbContext as an alias / specialized service for domain DB operations
builder.Services.AddScoped<BpmsDbContext>(sp =>
    new BpmsDbContext(sp.GetRequiredService<DbContextOptions<ApplicationDbContext>>()));

builder.Services.AddHsts(options =>
{
    options.Preload = false;
    options.IncludeSubDomains = false;
    options.MaxAge = TimeSpan.FromDays(365);
});

if (!builder.Environment.IsDevelopment())
{
    builder.Services.AddHttpsRedirection(options =>
    {
        options.RedirectStatusCode = StatusCodes.Status308PermanentRedirect;
        options.HttpsPort = 443;
    });
}

var app = builder.Build();

var initDb = args.Contains("--init-db") || args.Contains("--migrate");
var seed = args.Contains("--seed");
var resetAdminPassword = args.Contains("--reset-admin-password");

if (initDb || seed || resetAdminPassword)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<BpmsDbContext>();
    var connStr = builder.Configuration.GetConnectionString("BPMS_DB");

    if (initDb || seed)
    {
        Console.WriteLine("[DB] Initializing database and ensuring schema via EF Core (EnsureCreatedAsync)...");
        await db.Database.EnsureCreatedAsync();
        Console.WriteLine("[DB] Database and tables ensured successfully via EF Core.");

        Console.WriteLine("[SEED] Seeding initial admin user (local_admin)...");
        var (created, hash) = await SeedDb.SeedLocalAdminAsync(connStr);
        var hashPreview = hash.Length >= 40 ? hash[..40] : hash;
        Console.WriteLine($"[SEED] local_admin seeded (created={created}), hash={hashPreview}...");
    }

    if (resetAdminPassword)
    {
        if (!string.IsNullOrWhiteSpace(connStr))
        {
            await SeedDb.EnsureSchemaUpgradesAsync(connStr);
        }

        var envPassword = Environment.GetEnvironmentVariable("BPMS_RESET_ADMIN_PASSWORD");
        var newPassword = string.IsNullOrWhiteSpace(envPassword) ? "Admin@123456" : envPassword;

        var adminUser = await db.AppUsers.FirstOrDefaultAsync(u => u.Username == "local_admin");
        if (adminUser != null)
        {
            var hasher = scope.ServiceProvider.GetRequiredService<PasswordHasher>();
            adminUser.PasswordHash = hasher.HashPassword(newPassword);
            adminUser.AccessFailedCount = 0;
            adminUser.LockoutEnd = null;
            adminUser.IsActive = true;
            await db.SaveChangesAsync();
            Console.WriteLine("[RESET] Password, failed login counter (AccessFailedCount=0), and lockout (LockoutEnd=null) for 'local_admin' have been reset successfully.");
        }
        else
        {
            Console.WriteLine("[RESET-WARNING] User 'local_admin' was not found in dbo.AppUsers.");
        }
    }

    // If executed as a CLI maintenance command (e.g. from Deploy-BPMS.ps1 or terminal),
    // exit cleanly once initialization and seeding are complete unless explicitly told to continue.
    if (!args.Contains("--serve") && !args.Contains("--no-exit"))
    {
        Console.WriteLine("[CLI] Database initialization and maintenance completed successfully. Exiting.");
        return;
    }
}

// Configure the HTTP request pipeline.
var httpsSection = app.Configuration.GetSection("HttpsSettings");
var trustForwardedHeaders = httpsSection.GetValue<bool>("TrustForwardedHeaders", true);
var enableHsts = httpsSection.GetValue<bool>("EnableHsts", false);
var enableHttpsRedirect = httpsSection.GetValue<bool>("EnableHttpsRedirect", false);

if (trustForwardedHeaders)
{
    var forwardedHeadersOptions = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
    };
    forwardedHeadersOptions.KnownNetworks.Clear();
    forwardedHeadersOptions.KnownProxies.Clear();
    app.UseForwardedHeaders(forwardedHeadersOptions);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

if (enableHsts)
{
    app.UseHsts();
}

if (enableHttpsRedirect)
{
    app.UseHttpsRedirection();
}

// اعمال هدرهای امنیتی استاندارد و اعتبارسنجی فایل‌های آپلودی
var disallowedExtensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{
    ".exe", ".bat", ".cmd", ".sh", ".ps1", ".vbs", ".js", ".msi", ".dll", ".com", ".scr", ".pif", ".jar", ".cpl", ".reg", ".hta"
};

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";

    if (context.Request.HasFormContentType && context.Request.Form.Files.Count > 0)
    {
        foreach (var file in context.Request.Form.Files)
        {
            var ext = Path.GetExtension(file.FileName);
            if (!string.IsNullOrEmpty(ext) && disallowedExtensions.Contains(ext))
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsync("{\"message\": \"بارگذاری فایل‌های اجرایی یا اسکریپتی به دلایل امنیتی در سامانه مسدود است.\"}");
                return;
            }
        }
    }

    await next();
});

// اجرای ارتقای دوره‌ای و بررسی ستون‌های جدید دیتابیس در زمان راه‌اندازی
try
{
    var connStr = builder.Configuration.GetConnectionString("BPMS_DB");
    if (!string.IsNullOrWhiteSpace(connStr))
    {
        await SeedDb.EnsureSchemaUpgradesAsync(connStr);
    }
}
catch (Exception ex)
{
    Console.WriteLine($"[SCHEMA-UPGRADE-WARNING] Could not run schema upgrades on startup: {ex.Message}");
}

app.UseDefaultFiles();
app.UseStaticFiles();  // Serve wwwroot/uploads and compiled React SPA assets
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapFallbackToFile("index.html");

app.Run();
