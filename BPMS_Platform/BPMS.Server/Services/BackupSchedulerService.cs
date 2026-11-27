using System.Globalization;
using BPMS.Server.DTOs;

namespace BPMS.Server.Services;

public class BackupSchedulerService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<BackupSchedulerService> _logger;

    public BackupSchedulerService(IServiceScopeFactory scopeFactory, ILogger<BackupSchedulerService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("سرویس زمان‌بندی پشتیبان‌گیری در پس‌زمینه آغاز به کار کرد.");

        // تأخیر اولیه ۵ ثانیه‌ای جهت تکمیل بارگذاری برنامه
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndExecuteScheduledBackupAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "خطا در فرآیند بررسی زمان‌بندی پشتیبان‌گیری.");
            }

            try
            {
                // بررسی دقیق هر ۳۰ ثانیه طبق دستورالعمل
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("سرویس زمان‌بندی پشتیبان‌گیری متوقف شد.");
    }

    private async Task CheckAndExecuteScheduledBackupAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var backupService = scope.ServiceProvider.GetRequiredService<IBackupService>();

        var config = await backupService.GetScheduleConfigAsync();
        if (config == null || !config.IsEnabled)
        {
            return;
        }

        var now = DateTime.Now;
        var pc = new PersianCalendar();

        // بررسی تطابق شرط تاریخ
        if (!IsDateMatching(config, now, pc))
        {
            return;
        }

        // بررسی تطابق شرط زمان
        if (!IsTimeMatching(config, now))
        {
            return;
        }

        _logger.LogInformation("زمان‌بندی فرارسیده است. آغاز پشتیبان‌گیری خودکار...");

        try
        {
            var modules = config.Modules != null && config.Modules.Count > 0
                ? config.Modules
                : new List<string> { "users", "forms", "data", "settings", "uploads" };

            var fileInfo = await backupService.CreateAndSaveBackupAsync(
                modules,
                "پشتیبان‌گیری خودکار زمان‌بندی‌شده سامانه",
                "Scheduled",
                config.StoragePath);

            // اعمال سیاست نگهداری
            await backupService.ApplyRetentionPolicyAsync(config.StoragePath, config.MaxRetainedBackups);

            config.LastRunAtUtc = DateTime.UtcNow;
            config.LastRunAtPersian = BackupService.ToPersianDateTime(now);
            config.LastRunStatus = "Success";
            config.LastRunMessage = $"نسخه خودکار با نام {fileInfo.FileName} ({fileInfo.FileSizeFormatted}) ذخیره گردید.";

            // محاسبه زمان اجرای بعدی
            CalculateNextRun(config, now);
            await backupService.SaveScheduleConfigAsync(config);

            _logger.LogInformation("پشتیبان‌گیری زمان‌بندی‌شده با موفقیت انجام شد: {FileName}", fileInfo.FileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "خطا در اجرای پشتیبان‌گیری خودکار زمان‌بندی‌شده.");

            config.LastRunAtUtc = DateTime.UtcNow;
            config.LastRunAtPersian = BackupService.ToPersianDateTime(now);
            config.LastRunStatus = "Failed";
            config.LastRunMessage = $"خطا در ایجاد پشتیبان: {ex.Message}";

            CalculateNextRun(config, now);
            await backupService.SaveScheduleConfigAsync(config);
        }
    }

    private static bool IsDateMatching(ScheduleConfigDto config, DateTime now, PersianCalendar pc)
    {
        if (config.DateMode.Equals("recurring", StringComparison.OrdinalIgnoreCase))
        {
            if (config.RecurrenceType.Equals("daily", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (config.RecurrenceType.Equals("weekly", StringComparison.OrdinalIgnoreCase))
            {
                if (config.DaysOfWeek == null || config.DaysOfWeek.Count == 0) return false;
                return config.DaysOfWeek.Any(d => IsDayOfWeekMatch(now.DayOfWeek, d));
            }

            if (config.RecurrenceType.Equals("monthly", StringComparison.OrdinalIgnoreCase))
            {
                var pDay = pc.GetDayOfMonth(now);
                return pDay == config.DayOfMonth;
            }

            return true;
        }

        if (config.DateMode.Equals("specificDate", StringComparison.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(config.SpecificDate))
                return false;

            var todayP = $"{pc.GetYear(now):0000}/{pc.GetMonth(now):00}/{pc.GetDayOfMonth(now):00}";
            var targetP = config.SpecificDate.Trim();

            if (config.SpecificDateRepeat.Equals("none", StringComparison.OrdinalIgnoreCase))
            {
                return todayP.Equals(targetP, StringComparison.OrdinalIgnoreCase);
            }

            if (config.SpecificDateRepeat.Equals("daily", StringComparison.OrdinalIgnoreCase))
            {
                return string.Compare(todayP, targetP, StringComparison.OrdinalIgnoreCase) >= 0;
            }

            if (config.SpecificDateRepeat.Equals("weekly", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Compare(todayP, targetP, StringComparison.OrdinalIgnoreCase) < 0)
                    return false;
                // بررسی یکسان بودن روز هفته با تاریخ شروع
                return TryParsePersianDate(targetP, pc, out var startDt) && startDt.DayOfWeek == now.DayOfWeek;
            }

            if (config.SpecificDateRepeat.Equals("monthly", StringComparison.OrdinalIgnoreCase))
            {
                if (string.Compare(todayP, targetP, StringComparison.OrdinalIgnoreCase) < 0)
                    return false;
                var parts = targetP.Split('/');
                if (parts.Length == 3 && int.TryParse(parts[2], out var targetDay))
                {
                    return pc.GetDayOfMonth(now) == targetDay;
                }
            }
        }

        return false;
    }

    private static bool IsTimeMatching(ScheduleConfigDto config, DateTime now)
    {
        var slots = GetDailySlots(config);
        if (slots.Count == 0) return false;

        foreach (var (h, m) in slots)
        {
            // تطابق ساعت و بازه ۵ دقیقه‌ای اولیه جهت اطمینان از اجرای دقیق با وجود فواصل ۳۰ ثانیه‌ای
            if (now.Hour == h && now.Minute >= m && now.Minute <= m + 4)
            {
                // بررسی عدم اجرای تکراری در این بازه (حداقل ۱۰ دقیقه فاصله از آخرین اجرا)
                if (config.LastRunAtUtc.HasValue)
                {
                    var diffMinutes = (DateTime.UtcNow - config.LastRunAtUtc.Value).TotalMinutes;
                    if (diffMinutes < 8)
                    {
                        return false;
                    }
                }
                return true;
            }
        }

        return false;
    }

    public static List<(int Hour, int Minute)> GetDailySlots(ScheduleConfigDto config)
    {
        var slots = new List<(int Hour, int Minute)>();
        if (!TryParseTime(config.StartTime, out var sHour, out var sMin))
        {
            sHour = 2;
            sMin = 0;
        }

        slots.Add((sHour, sMin));

        if (config.ContinueRunningIntraDay)
        {
            if (!TryParseTime(config.LastRunTime, out var eHour, out var eMin))
            {
                eHour = 23;
                eMin = 0;
            }

            var interval = config.IntraDayIntervalHours <= 0 ? 2 : config.IntraDayIntervalHours;
            var currentTotalMin = sHour * 60 + sMin + interval * 60;
            var endTotalMin = eHour * 60 + eMin;

            while (currentTotalMin <= endTotalMin && currentTotalMin < 24 * 60)
            {
                slots.Add((currentTotalMin / 60, currentTotalMin % 60));
                currentTotalMin += interval * 60;
            }
        }

        return slots;
    }

    public static void CalculateNextRun(ScheduleConfigDto config, DateTime fromLocal)
    {
        var slots = GetDailySlots(config);
        var pc = new PersianCalendar();

        for (int dayOffset = 0; dayOffset <= 35; dayOffset++)
        {
            var testDate = fromLocal.Date.AddDays(dayOffset);
            if (!IsDateMatching(config, testDate, pc))
                continue;

            foreach (var (h, m) in slots)
            {
                var targetDt = testDate.AddHours(h).AddMinutes(m);
                if (targetDt > fromLocal.AddMinutes(1))
                {
                    config.NextRunAtUtc = targetDt.ToUniversalTime();
                    config.NextRunAtPersian = BackupService.ToPersianDateTime(targetDt);
                    return;
                }
            }
        }

        config.NextRunAtUtc = null;
        config.NextRunAtPersian = null;
    }

    private static bool TryParseTime(string? timeStr, out int hour, out int minute)
    {
        hour = 0;
        minute = 0;
        if (string.IsNullOrWhiteSpace(timeStr)) return false;

        var parts = timeStr.Trim().Split(':');
        if (parts.Length >= 2 && int.TryParse(parts[0], out hour) && int.TryParse(parts[1], out minute))
        {
            return hour is >= 0 and <= 23 && minute is >= 0 and <= 59;
        }
        return false;
    }

    private static bool TryParsePersianDate(string jalaliStr, PersianCalendar pc, out DateTime dt)
    {
        dt = DateTime.MinValue;
        if (string.IsNullOrWhiteSpace(jalaliStr)) return false;
        var p = jalaliStr.Trim().Split('/');
        if (p.Length == 3 && int.TryParse(p[0], out var y) && int.TryParse(p[1], out var m) && int.TryParse(p[2], out var d))
        {
            try
            {
                dt = pc.ToDateTime(y, m, d, 0, 0, 0, 0);
                return true;
            }
            catch {}
        }
        return false;
    }

    private static bool IsDayOfWeekMatch(DayOfWeek currentDay, string savedDay)
    {
        if (string.IsNullOrWhiteSpace(savedDay)) return false;
        savedDay = savedDay.Trim();

        if (savedDay.Equals(currentDay.ToString(), StringComparison.OrdinalIgnoreCase))
            return true;

        if (savedDay.Length >= 3 && savedDay.StartsWith(currentDay.ToString()[..3], StringComparison.OrdinalIgnoreCase))
            return true;

        switch (currentDay)
        {
            case DayOfWeek.Saturday:
                if (savedDay is "شنبه" or "6" or "sat" or "saturday") return true;
                break;
            case DayOfWeek.Sunday:
                if (savedDay is "یک‌شنبه" or "یکشنبه" or "0" or "sun" or "sunday") return true;
                break;
            case DayOfWeek.Monday:
                if (savedDay is "دوشنبه" or "1" or "mon" or "monday") return true;
                break;
            case DayOfWeek.Tuesday:
                if (savedDay is "سه‌شنبه" or "سه شنبه" or "2" or "tue" or "tuesday") return true;
                break;
            case DayOfWeek.Wednesday:
                if (savedDay is "چهارشنبه" or "3" or "wed" or "wednesday") return true;
                break;
            case DayOfWeek.Thursday:
                if (savedDay is "پنج‌شنبه" or "پنجشنبه" or "4" or "thu" or "thursday") return true;
                break;
            case DayOfWeek.Friday:
                if (savedDay is "جمعه" or "5" or "fri" or "friday") return true;
                break;
        }

        return false;
    }
}
