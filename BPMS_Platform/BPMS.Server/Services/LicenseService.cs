using System.Globalization;
using System.Management;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BPMS.Server.Data;
using BPMS.Server.Models;
using BPMS.Server.Models.Dtos;
using Microsoft.EntityFrameworkCore;

namespace BPMS.Server.Services;

public class LicenseService : ILicenseService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<LicenseService> _logger;

    // Public Key (RSA-2048) for signature verification
    private const string RsaPublicKeyXml = @"<RSAKeyValue><Modulus>8cJjuFUdhv/lYSPpVRoaq0/v1zErsYsVpnKavcwGOZItv3ScU+mNvkrnvtRxhKckPY728PIRNAQG/AcwawvdfrQbTgvPdEsL88FzPjPkLT5BUn1ugT6BMSSAERG2/PVTsXExQwM/CDfyrO3pIeLCNVa2ElbmR/c2w352h3sU9di4Dyol3Mz7i5g/cTyo+Bt+vfyKRqNC4XFlhcudaJFit3LYnUtLuoLBwXEd37ti2kU8+C4RkTMr3/uyafpADpYks0hkKdi0r3cNIy5Vu17f/SHD6CK9XtRIsBzT1R3zkFSfaW6RsJRyjVZ1yVB2eEYjoVXqGDVeuAZJ/8Foz+AfIQ==</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>";

    private static string? _cachedMachineId;

    public LicenseService(ApplicationDbContext context, IConfiguration configuration, ILogger<LicenseService> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// تولید شناسه سخت‌افزاری پایدار سرور به فرمت BPMS-XXXX-XXXX-XXXX-XXXX
    /// از ترکیب هش‌شده SHA-256 مشخصات سرور (MachineGuid رجیستری، شماره سریال BIOS/مادربرد و نام ماشین).
    /// </summary>
    public Task<string> GetMachineIdAsync()
    {
        if (!string.IsNullOrEmpty(_cachedMachineId))
        {
            return Task.FromResult(_cachedMachineId);
        }

        var machineGuid = GetRegistryMachineGuid();
        var biosSerial = GetBiosOrMotherboardSerial();
        var machineName = Environment.MachineName?.Trim() ?? string.Empty;

        var rawHardwareString = $"GUID={machineGuid}|BIOS={biosSerial}|HOST={machineName}".ToUpperInvariant();
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(rawHardwareString));
        var hex = Convert.ToHexString(hashBytes).ToUpperInvariant();

        // BPMS-XXXX-XXXX-XXXX-XXXX
        _cachedMachineId = $"BPMS-{hex[..4]}-{hex.Substring(4, 4)}-{hex.Substring(8, 4)}-{hex.Substring(12, 4)}";
        return Task.FromResult(_cachedMachineId);
    }

    /// <summary>
    /// اعتبارسنجی لایسنس: اگر کلیدی ارسال شود همان کلید بررسی می‌شود؛ در غیر این صورت کلید فعال
    /// از جدول SystemSettings واکشی شده و در صورت نبود کلید، وضعیت Trial اعمال می‌گردد.
    /// همچنین تشخیص عقب کشیدن ساعت سیستم (Anti-Clock Tampering) به صورت خودکار اعمال می‌شود.
    /// </summary>
    public async Task<LicenseValidationResult> ValidateLicenseAsync(string? licenseKey = null)
    {
        var currentMachineId = await GetMachineIdAsync();

        // بررسی دستکاری ساعت سیستم (Anti-Clock Tampering)
        var tampering = await CheckClockTamperedAsync(currentMachineId);
        if (tampering.IsTampered)
        {
            return new LicenseValidationResult
            {
                IsValid = false,
                Status = "ClockTampered",
                IsTrial = true,
                OrganizationName = "تعلیق به دلیل دستکاری ساعت سرور",
                ErrorMessage = tampering.ErrorMessage
            };
        }

        // در صورتی که کلید مستقیماً پاس داده نشده باشد، از دیتابیس می‌خوانیم
        if (string.IsNullOrWhiteSpace(licenseKey))
        {
            var licenseSetting = await _context.SystemSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.SettingKey == "License:Key");

            licenseKey = licenseSetting?.SettingValue;
        }

        LicenseValidationResult result;
        // اگر هیچ کلیدی ثبت نشده بود، وضعیت ارزیابی Trial اعمال می‌شود
        if (string.IsNullOrWhiteSpace(licenseKey))
        {
            result = await GetTrialStatusAsync(currentMachineId);
        }
        else
        {
            result = VerifyLicenseString(licenseKey.Trim(), currentMachineId);
        }

        // ثبت آخرین فعالیت جهت کنترل Tampering در صورت معتبر بودن
        if (result.IsValid || result.Status == "Trial" || result.Status == "Active")
        {
            await RecordActivityInternalAsync(currentMachineId, null);
        }

        return result;
    }

    /// <summary>
    /// دریافت وضعیت کامل لایسنس جاری سامانه به همراه مشخصات سازمان، کاربران فعال و اطلاعات پشتیبانی
    /// </summary>
    public async Task<LicenseStatusDto> GetLicenseStatusAsync()
    {
        var machineId = await GetMachineIdAsync();
        var validation = await ValidateLicenseAsync(null);
        var activeUsersCount = await _context.AppUsers.CountAsync(u => u.IsActive);

        var expiresAt = validation.ExpiresAt ?? DateTime.UtcNow;
        var daysRemaining = (int)Math.Ceiling((expiresAt - DateTime.UtcNow).TotalDays);
        if (daysRemaining < 0) daysRemaining = 0;

        var pc = new PersianCalendar();
        string expiresAtPersian;
        try
        {
            expiresAtPersian = $"{pc.GetYear(expiresAt):0000}/{pc.GetMonth(expiresAt):00}/{pc.GetDayOfMonth(expiresAt):00}";
        }
        catch
        {
            expiresAtPersian = expiresAt.ToString("yyyy/MM/dd");
        }

        var vendor = new VendorInfoDto
        {
            CompanyName = _configuration["VendorInfo:CompanyName"] ?? "Shahab Nazemi",
            Email = _configuration["VendorInfo:Email"] ?? "shahab.nazemi@gmail.com",
            Phone = _configuration["VendorInfo:Phone"] ?? "0900-000-0000",
            Website = _configuration["VendorInfo:Website"] ?? "https://github.com/NazemiSh/BPMS-BRMS-Platform",
            WhatsappUrl = _configuration["VendorInfo:WhatsappUrl"] ?? "https://wa.me/qr/X7NJ6BHTONWWF1",
            RepositoryUrl = _configuration["VendorInfo:RepositoryUrl"] ?? "https://github.com/NazemiSh/BPMS-BRMS-Platform"
        };

        return new LicenseStatusDto
        {
            MachineId = machineId,
            Status = validation.Status,
            IsTrial = validation.IsTrial,
            OrganizationName = validation.OrganizationName,
            ExpiresAt = expiresAt,
            ExpiresAtIso = expiresAt.ToString("O"),
            ExpiresAtPersian = expiresAtPersian,
            DaysRemaining = daysRemaining,
            MaxUsers = validation.MaxUsers,
            ActiveUsersCount = activeUsersCount,
            EnableAiModule = validation.EnableAiModule,
            Version = "1.0.0",
            VendorInfo = vendor
        };
    }

    /// <summary>
    /// فعال‌سازی کلید جدید: اعتبارسنجی امضای RSA، تطابق MachineId و ذخیره در جدول SystemSettings
    /// </summary>
    public async Task<(bool Success, string Message, LicenseStatusDto? Status)> ActivateLicenseAsync(string licenseKey)
    {
        if (string.IsNullOrWhiteSpace(licenseKey))
        {
            return (false, "کد کلید لایسنس نمی‌تواند خالی باشد.", null);
        }

        var currentMachineId = await GetMachineIdAsync();
        var validation = VerifyLicenseString(licenseKey.Trim(), currentMachineId);

        if (!validation.IsValid)
        {
            return (false, validation.ErrorMessage ?? "کلید لایسنس ارائه شده نامعتبر است.", null);
        }

        // ذخیره کلید لایسنس در جدول SystemSettings با کلید License:Key
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "License:Key");
        if (setting == null)
        {
            setting = new SystemSetting
            {
                SettingKey = "License:Key",
                SettingValue = licenseKey.Trim(),
                UpdatedAt = DateTime.UtcNow
            };
            _context.SystemSettings.Add(setting);
        }
        else
        {
            setting.SettingValue = licenseKey.Trim();
            setting.UpdatedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        var updatedStatus = await GetLicenseStatusAsync();
        _logger.LogInformation("License successfully activated for organization '{Org}' on machine '{MachineId}'",
            validation.OrganizationName, currentMachineId);

        return (true, $"لایسنس سازمانی با موفقیت برای «{validation.OrganizationName}» فعال گردید.", updatedStatus);
    }

    /// <summary>
    /// حذف کلید لایسنس از جدول SystemSettings و بازگشت سامانه به وضعیت آزمایشی (Trial)
    /// </summary>
    public async Task<bool> RemoveLicenseAsync()
    {
        var setting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "License:Key");
        if (setting != null)
        {
            _context.SystemSettings.Remove(setting);
            await _context.SaveChangesAsync();
            _logger.LogInformation("License key removed. System reverted to trial mode.");
            return true;
        }
        return false;
    }

    /// <summary>
    /// بررسی ساختار رمزنگاری‌شده کلید لایسنس با امضای RSA-2048 و تطابق Machine ID
    /// فرمت کلید: Base64(PayloadJson).Base64(RsaSignature)
    /// </summary>
    private LicenseValidationResult VerifyLicenseString(string keyString, string currentMachineId)
    {
        try
        {
            // تمیزکاری فاصله‌ها و شکست خط‌های احتمالی
            var cleanKey = keyString.Trim().Replace("\r", string.Empty).Replace("\n", string.Empty).Replace(" ", string.Empty);
            var parts = cleanKey.Split('.');
            if (parts.Length != 2)
            {
                return new LicenseValidationResult
                {
                    IsValid = false,
                    Status = "Invalid",
                    ErrorMessage = "فرمت کلید لایسنس نامعتبر است (الگوی ساختار payload.signature رعایت نشده است)."
                };
            }

            var payloadBytes = Convert.FromBase64String(parts[0]);
            var signatureBytes = Convert.FromBase64String(parts[1]);

            // اعتبارسنجی امضای دیجیتال با کلید عمومی RSA-2048
            using var rsa = RSA.Create();
            rsa.FromXmlString(RsaPublicKeyXml);

            var isSignatureValid = rsa.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            if (!isSignatureValid)
            {
                return new LicenseValidationResult
                {
                    IsValid = false,
                    Status = "Invalid",
                    ErrorMessage = "امضای دیجیتال کلید لایسنس نامعتبر است یا محتوای آن دستکاری شده است."
                };
            }

            // خواندن متادیتای لایسنس
            var payloadJson = Encoding.UTF8.GetString(payloadBytes);
            var payload = JsonSerializer.Deserialize<LicensePayload>(payloadJson, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (payload == null)
            {
                return new LicenseValidationResult
                {
                    IsValid = false,
                    Status = "Invalid",
                    ErrorMessage = "داده‌های متادیتای لایسنس قابل خواندن نیستند."
                };
            }

            // بررسی تطابق شناسه سخت‌افزاری (Machine ID)
            if (!string.Equals(payload.MachineId?.Trim(), currentMachineId?.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return new LicenseValidationResult
                {
                    IsValid = false,
                    Status = "Invalid",
                    OrganizationName = payload.OrganizationName,
                    ErrorMessage = $"این لایسنس منحصراً برای شناسه سخت‌افزاری ({payload.MachineId}) صادر شده و با شناسه این سرور ({currentMachineId}) همخوانی ندارد."
                };
            }

            // بررسی تاریخ انقضا
            if (payload.ExpiresAt < DateTime.UtcNow)
            {
                return new LicenseValidationResult
                {
                    IsValid = false,
                    Status = "Expired",
                    IsTrial = false,
                    OrganizationName = payload.OrganizationName,
                    ExpiresAt = payload.ExpiresAt,
                    MaxUsers = payload.MaxUsers,
                    EnableAiModule = payload.EnableAiModule,
                    ErrorMessage = "تاریخ اعتبار لایسنس این سرور به پایان رسیده است."
                };
            }

            return new LicenseValidationResult
            {
                IsValid = true,
                Status = "Active",
                IsTrial = false,
                OrganizationName = payload.OrganizationName,
                ExpiresAt = payload.ExpiresAt,
                MaxUsers = payload.MaxUsers > 0 ? payload.MaxUsers : 5,
                EnableAiModule = payload.EnableAiModule
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while verifying license key");
            return new LicenseValidationResult
            {
                IsValid = false,
                Status = "Invalid",
                ErrorMessage = $"خطا در پردازش کلید لایسنس: {ex.Message}"
            };
        }
    }

    private const string SysLicFilePath = @"C:\ProgramData\BPMS\.syslic";
    private const string RegistrySubKey = @"SOFTWARE\BPMSPlatform";
    private const string RegistryValueName = "SysLicData";

    private class PersistentLicenseRecord
    {
        public string MachineId { get; set; } = string.Empty;
        public DateTime TrialStartDate { get; set; }
        public DateTime LastActivityDate { get; set; }
        public string Checksum { get; set; } = string.Empty;
    }

    public async Task RecordActivityAsync()
    {
        var machineId = await GetMachineIdAsync();
        await RecordActivityInternalAsync(machineId, null);
    }

    private async Task RecordActivityInternalAsync(string machineId, DateTime? explicitTrialStart)
    {
        try
        {
            var now = DateTime.UtcNow;
            var existingRecord = LoadPersistentRecord(machineId);

            var trialStart = explicitTrialStart 
                ?? existingRecord?.TrialStartDate 
                ?? await GetDbTrialStartDateAsync() 
                ?? now;

            // به‌روزرسانی در دیتابیس
            var activitySetting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "License:LastActivityTime");
            if (activitySetting == null)
            {
                activitySetting = new SystemSetting
                {
                    SettingKey = "License:LastActivityTime",
                    SettingValue = now.ToString("O"),
                    UpdatedAt = now
                };
                _context.SystemSettings.Add(activitySetting);
            }
            else
            {
                activitySetting.SettingValue = now.ToString("O");
                activitySetting.UpdatedAt = now;
            }
            await _context.SaveChangesAsync();

            // ذخیره رمزنگاری‌شده در رجیستری و فایل سیستمی مخفی
            var newRecord = new PersistentLicenseRecord
            {
                MachineId = machineId,
                TrialStartDate = trialStart,
                LastActivityDate = now,
                Checksum = ComputeRecordChecksum(machineId, trialStart, now)
            };

            var encrypted = EncryptRecord(newRecord, machineId);
            WriteRegistryRecord(encrypted);
            WriteFileRecord(encrypted);
        }
        catch (Exception ex)
        {
            _logger.LogTrace(ex, "Could not record license activity heartbeat");
        }
    }

    private async Task<(bool IsTampered, string? ErrorMessage)> CheckClockTamperedAsync(string machineId)
    {
        try
        {
            var now = DateTime.UtcNow;
            var dates = new List<DateTime>();

            // ۱. بررسی آخرین فعالیت در دیتابیس
            var dbSetting = await _context.SystemSettings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.SettingKey == "License:LastActivityTime");
            if (dbSetting != null && DateTime.TryParse(dbSetting.SettingValue, null, DateTimeStyles.RoundtripKind, out var dbTime))
            {
                dates.Add(dbTime);
            }

            // ۲. بررسی آخرین فعالیت در فایل و رجیستری
            var fileRec = ReadFileRecord(machineId);
            if (fileRec != null) dates.Add(fileRec.LastActivityDate);

            var regRec = ReadRegistryRecord(machineId);
            if (regRec != null) dates.Add(regRec.LastActivityDate);

            if (dates.Count > 0)
            {
                var maxRecordedActivity = dates.Max();
                // اگر ساعت سیستم بیش از ۳ دقیقه از آخرین زمان فعالیت عقب‌تر باشد، دستکاری تشخیص داده می‌شود
                if (now < maxRecordedActivity.AddMinutes(-3))
                {
                    _logger.LogWarning("System clock rollback detected! Recorded={Recorded}, Current={Current}", maxRecordedActivity, now);
                    return (true, $"ساعت سیستم سرور به عقب کشیده شده است یا دستکاری در زمان تشخیص داده شد (آخرین زمان فعالیت ثبت‌شده: {maxRecordedActivity:yyyy/MM/dd HH:mm:ss} UTC، زمان فعلی سیستم: {now:yyyy/MM/dd HH:mm:ss} UTC). سامانه به حالت تعلیق درآمد.");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error while checking clock tampering");
        }

        return (false, null);
    }

    private async Task<DateTime?> GetDbTrialStartDateAsync()
    {
        var trialSetting = await _context.SystemSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.SettingKey == "License:TrialStartDate");
        if (trialSetting != null && DateTime.TryParse(trialSetting.SettingValue, null, DateTimeStyles.RoundtripKind, out var dt))
        {
            return dt;
        }
        return null;
    }

    /// <summary>
    /// مدیریت دوره ارزیابی ۱۴ روزه (Trial Mode) با ماندگاری در ۳ منبع (دیتابیس، رجیستری و فایل سیستمی ProgramData)
    /// </summary>
    private async Task<LicenseValidationResult> GetTrialStatusAsync(string machineId)
    {
        var candidates = new List<DateTime>();

        // ۱. واکشی از دیتابیس
        var dbDate = await GetDbTrialStartDateAsync();
        if (dbDate.HasValue) candidates.Add(dbDate.Value);

        // ۲. واکشی از رجیستری ویندوز
        var regRec = ReadRegistryRecord(machineId);
        if (regRec != null) candidates.Add(regRec.TrialStartDate);

        // ۳. واکشی از فایل سیستمی مخفی ProgramData
        var fileRec = ReadFileRecord(machineId);
        if (fileRec != null) candidates.Add(fileRec.TrialStartDate);

        DateTime trialStart;
        if (candidates.Count > 0)
        {
            // انتخاب قدیمی‌ترین تاریخ شروع جهت جلوگیری از دور زدن پس از Reset دیتابیس
            trialStart = candidates.Min();
        }
        else
        {
            // اولین اجرای سامانه در این سرور
            trialStart = DateTime.UtcNow;
        }

        // همگام‌سازی تاریخ در دیتابیس
        var trialSetting = await _context.SystemSettings.FirstOrDefaultAsync(s => s.SettingKey == "License:TrialStartDate");
        if (trialSetting == null)
        {
            trialSetting = new SystemSetting
            {
                SettingKey = "License:TrialStartDate",
                SettingValue = trialStart.ToString("O"),
                UpdatedAt = DateTime.UtcNow
            };
            _context.SystemSettings.Add(trialSetting);
            await _context.SaveChangesAsync();
        }
        else if (trialSetting.SettingValue != trialStart.ToString("O"))
        {
            trialSetting.SettingValue = trialStart.ToString("O");
            trialSetting.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        // همگام‌سازی در رجیستری و فایل ProgramData
        await RecordActivityInternalAsync(machineId, trialStart);

        var trialEnd = trialStart.AddDays(14);
        var isExpired = DateTime.UtcNow > trialEnd;

        return new LicenseValidationResult
        {
            IsValid = !isExpired,
            Status = isExpired ? "Expired" : "Trial",
            IsTrial = true,
            OrganizationName = isExpired ? "نسخه ارزیابی (منقضی شده)" : "نسخه ارزیابی (Trial)",
            ExpiresAt = trialEnd,
            MaxUsers = 5,
            EnableAiModule = false,
            ErrorMessage = isExpired ? "مهلت ۱۴ روزه دوره ارزیابی به پایان رسیده است. لطفاً جهت دریافت لایسنس دائم اقدام نمایید." : null
        };
    }

    private PersistentLicenseRecord? LoadPersistentRecord(string machineId)
    {
        return ReadFileRecord(machineId) ?? ReadRegistryRecord(machineId);
    }

    private static string ComputeRecordChecksum(string machineId, DateTime trialStart, DateTime lastActivity)
    {
        using var sha256 = SHA256.Create();
        var raw = $"{machineId}|{trialStart:O}|{lastActivity:O}|BPMS_INTEGRITY_SALT_#$@!";
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash);
    }

    private static byte[] DeriveKey(string machineId)
    {
        using var sha256 = SHA256.Create();
        return sha256.ComputeHash(Encoding.UTF8.GetBytes($"{machineId}_BPMS_SYS_LIC_SALT_!#7x9"));
    }

    private static string EncryptRecord(PersistentLicenseRecord record, string machineId)
    {
        var json = JsonSerializer.Serialize(record);
        var key = DeriveKey(machineId);
        using var aes = Aes.Create();
        aes.Key = key;
        aes.GenerateIV();
        using var encryptor = aes.CreateEncryptor();
        var plainBytes = Encoding.UTF8.GetBytes(json);
        var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);
        var result = new byte[aes.IV.Length + cipherBytes.Length];
        Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
        Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);
        return Convert.ToBase64String(result);
    }

    private static PersistentLicenseRecord? DecryptRecord(string cipherBase64, string machineId)
    {
        try
        {
            var key = DeriveKey(machineId);
            var fullBytes = Convert.FromBase64String(cipherBase64.Trim());
            if (fullBytes.Length < 17) return null;
            using var aes = Aes.Create();
            aes.Key = key;
            var iv = new byte[16];
            var cipherBytes = new byte[fullBytes.Length - 16];
            Buffer.BlockCopy(fullBytes, 0, iv, 0, 16);
            Buffer.BlockCopy(fullBytes, 16, cipherBytes, 0, cipherBytes.Length);
            aes.IV = iv;
            using var decryptor = aes.CreateDecryptor();
            var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);
            var json = Encoding.UTF8.GetString(plainBytes);
            var rec = JsonSerializer.Deserialize<PersistentLicenseRecord>(json);
            if (rec == null || !string.Equals(rec.MachineId, machineId, StringComparison.OrdinalIgnoreCase))
                return null;

            var expectedChecksum = ComputeRecordChecksum(rec.MachineId, rec.TrialStartDate, rec.LastActivityDate);
            if (!string.Equals(rec.Checksum, expectedChecksum, StringComparison.OrdinalIgnoreCase))
                return null;

            return rec;
        }
        catch
        {
            return null;
        }
    }

    private static void WriteRegistryRecord(string encryptedValue)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                try
                {
                    using var hklm = Microsoft.Win32.RegistryKey.OpenBaseKey(
                        Microsoft.Win32.RegistryHive.LocalMachine,
                        Microsoft.Win32.RegistryView.Registry64);
                    using var subKey = hklm.CreateSubKey(RegistrySubKey, true);
                    subKey?.SetValue(RegistryValueName, encryptedValue);
                }
                catch
                {
                    // Fallback to CurrentUser if HKLM permissions are restricted
                    using var hkcu = Microsoft.Win32.RegistryKey.OpenBaseKey(
                        Microsoft.Win32.RegistryHive.CurrentUser,
                        Microsoft.Win32.RegistryView.Registry64);
                    using var subKey = hkcu.CreateSubKey(RegistrySubKey, true);
                    subKey?.SetValue(RegistryValueName, encryptedValue);
                }
            }
        }
        catch {}
    }

    private static PersistentLicenseRecord? ReadRegistryRecord(string machineId)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                string? raw = null;
                try
                {
                    using var hklm = Microsoft.Win32.RegistryKey.OpenBaseKey(
                        Microsoft.Win32.RegistryHive.LocalMachine,
                        Microsoft.Win32.RegistryView.Registry64);
                    using var subKey = hklm.OpenSubKey(RegistrySubKey);
                    raw = subKey?.GetValue(RegistryValueName)?.ToString();
                }
                catch {}

                if (string.IsNullOrWhiteSpace(raw))
                {
                    try
                    {
                        using var hkcu = Microsoft.Win32.RegistryKey.OpenBaseKey(
                            Microsoft.Win32.RegistryHive.CurrentUser,
                            Microsoft.Win32.RegistryView.Registry64);
                        using var subKey = hkcu.OpenSubKey(RegistrySubKey);
                        raw = subKey?.GetValue(RegistryValueName)?.ToString();
                    }
                    catch {}
                }

                if (!string.IsNullOrWhiteSpace(raw))
                {
                    return DecryptRecord(raw, machineId);
                }
            }
        }
        catch {}
        return null;
    }

    private static void WriteFileRecord(string encryptedValue)
    {
        try
        {
            var dir = Path.GetDirectoryName(SysLicFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            if (File.Exists(SysLicFilePath))
            {
                var attrs = File.GetAttributes(SysLicFilePath);
                if ((attrs & FileAttributes.Hidden) != 0 || (attrs & FileAttributes.ReadOnly) != 0)
                {
                    File.SetAttributes(SysLicFilePath, FileAttributes.Normal);
                }
            }

            File.WriteAllText(SysLicFilePath, encryptedValue, Encoding.UTF8);

            try
            {
                File.SetAttributes(SysLicFilePath, FileAttributes.Hidden | FileAttributes.System);
            }
            catch {}
        }
        catch {}
    }

    private static PersistentLicenseRecord? ReadFileRecord(string machineId)
    {
        try
        {
            if (File.Exists(SysLicFilePath))
            {
                var raw = File.ReadAllText(SysLicFilePath, Encoding.UTF8)?.Trim();
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    return DecryptRecord(raw, machineId);
                }
            }
        }
        catch {}
        return null;
    }

    private static string GetRegistryMachineGuid()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var baseKey = Microsoft.Win32.RegistryKey.OpenBaseKey(
                    Microsoft.Win32.RegistryHive.LocalMachine,
                    Microsoft.Win32.RegistryView.Registry64);
                using var cryptoKey = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
                var val = cryptoKey?.GetValue("MachineGuid")?.ToString();
                if (!string.IsNullOrWhiteSpace(val)) return val.Trim();
            }
        }
        catch
        {
            // Fallback safe
        }
        return string.Empty;
    }

    private static string GetBiosOrMotherboardSerial()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                var biosSerial = GetWmiValue("Win32_BIOS", "SerialNumber");
                if (!string.IsNullOrWhiteSpace(biosSerial) && !biosSerial.Equals("To be filled by O.E.M.", StringComparison.OrdinalIgnoreCase))
                {
                    return biosSerial.Trim();
                }

                var baseBoard = GetWmiValue("Win32_BaseBoard", "SerialNumber");
                if (!string.IsNullOrWhiteSpace(baseBoard) && !baseBoard.Equals("None", StringComparison.OrdinalIgnoreCase))
                {
                    return baseBoard.Trim();
                }

                var uuid = GetWmiValue("Win32_ComputerSystemProduct", "UUID");
                if (!string.IsNullOrWhiteSpace(uuid))
                {
                    return uuid.Trim();
                }
            }
        }
        catch
        {
            // Fallback safe
        }
        return string.Empty;
    }

    private static string? GetWmiValue(string className, string propertyName)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var searcher = new ManagementObjectSearcher($"SELECT {propertyName} FROM {className}");
                using var results = searcher.Get();
                foreach (ManagementObject result in results)
                {
                    var val = result[propertyName]?.ToString();
                    if (!string.IsNullOrWhiteSpace(val)) return val.Trim();
                }
            }
        }
        catch
        {
            // Ignore WMI errors
        }
        return null;
    }
}
