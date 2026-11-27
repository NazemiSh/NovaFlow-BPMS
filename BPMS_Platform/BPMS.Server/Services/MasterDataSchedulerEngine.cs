using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BPMS.Server.Services;

public class ScheduleConfigModel
{
    /// <summary>
    /// Frequency: "None" | "Once" | "Hour" | "Day" | "Week" | "Month"
    /// </summary>
    public string Frequency { get; set; } = "None";

    public int Hour { get; set; } = 0;
    public int Minute { get; set; } = 0;

    // Hour interval
    public int IntervalHours { get; set; } = 1;
    public int IntervalMinutes { get; set; } = 0;

    // Day interval
    public int IntervalDays { get; set; } = 1;
    public bool WorkdaysOnly { get; set; } = false; // Saturday - Wednesday

    // Week interval
    public int IntervalWeeks { get; set; } = 1;
    public List<string> DaysOfWeek { get; set; } = new(); // "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"

    // Month interval
    public List<int> Months { get; set; } = new(); // 1-12
    public List<int> DaysOfMonth { get; set; } = new(); // 1-31
    public bool LastDayOfMonth { get; set; } = false;

    // Once specific
    public string? RunDate { get; set; } // YYYY-MM-DD or 1405/01/01

    // Overall boundaries
    public string? StartDate { get; set; } // YYYY-MM-DD or 1405/01/01
    public string? EndDate { get; set; }   // YYYY-MM-DD or 1405/01/01
}

public static class MasterDataSchedulerEngine
{
    private static readonly TimeZoneInfo IranTimeZone;
    private static readonly PersianCalendar Pc = new();

    static MasterDataSchedulerEngine()
    {
        try
        {
            IranTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Iran Standard Time");
        }
        catch
        {
            try
            {
                IranTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Tehran");
            }
            catch
            {
                IranTimeZone = TimeZoneInfo.CreateCustomTimeZone(
                    "Iran Standard Time",
                    TimeSpan.FromHours(3.5),
                    "Iran Standard Time",
                    "Iran Standard Time");
            }
        }
    }

    public static TimeZoneInfo GetIranTimeZone() => IranTimeZone;

    /// <summary>
    /// Calculates the next run time in UTC based on schedule configuration and current time.
    /// </summary>
    public static DateTime? CalculateNextRun(
        string? scheduleConfigJson,
        DateTime fromUtc,
        string? fallbackScheduleType = null,
        string? fallbackScheduleValue = null)
    {
        ScheduleConfigModel? config = null;

        if (!string.IsNullOrWhiteSpace(scheduleConfigJson))
        {
            try
            {
                config = JsonSerializer.Deserialize<ScheduleConfigModel>(scheduleConfigJson, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch
            {
                // Fallback below
            }
        }

        // Backward compatibility with legacy SyncScheduleType
        if (config == null || string.Equals(config.Frequency, "None", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.IsNullOrWhiteSpace(fallbackScheduleType) && fallbackScheduleType != "None")
            {
                config = ConvertLegacyToConfig(fallbackScheduleType, fallbackScheduleValue);
            }
        }

        if (config == null || string.Equals(config.Frequency, "None", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        // Convert reference UTC to Iran local time
        DateTime iranNow = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, IranTimeZone);

        // Parse StartDate boundary (if set and in future, iranNow starts there)
        DateTime? boundaryStart = ParseDateToIranLocal(config.StartDate);
        if (boundaryStart.HasValue && boundaryStart.Value > iranNow)
        {
            iranNow = boundaryStart.Value.Date;
        }

        DateTime? boundaryEnd = ParseDateToIranLocal(config.EndDate);
        if (boundaryEnd.HasValue)
        {
            // End of the day 23:59:59
            boundaryEnd = boundaryEnd.Value.Date.AddDays(1).AddSeconds(-1);
        }

        DateTime? nextIranTime = config.Frequency.ToLowerInvariant() switch
        {
            "once" => CalculateOnce(config, iranNow),
            "hour" => CalculateHourly(config, iranNow),
            "day" => CalculateDaily(config, iranNow),
            "week" => CalculateWeekly(config, iranNow),
            "month" => CalculateMonthly(config, iranNow),
            _ => null
        };

        if (!nextIranTime.HasValue)
        {
            return null;
        }

        // Verify end boundary
        if (boundaryEnd.HasValue && nextIranTime.Value > boundaryEnd.Value)
        {
            return null; // Schedule expired
        }

        // Convert next Iran local time back to UTC
        return TimeZoneInfo.ConvertTimeToUtc(nextIranTime.Value, IranTimeZone);
    }

    private static DateTime? CalculateOnce(ScheduleConfigModel config, DateTime iranNow)
    {
        DateTime? targetDate = ParseDateToIranLocal(config.RunDate);
        if (!targetDate.HasValue) return null;

        var cand = targetDate.Value.Date.AddHours(config.Hour).AddMinutes(config.Minute);
        return cand > iranNow ? cand : null;
    }

    private static DateTime? CalculateHourly(ScheduleConfigModel config, DateTime iranNow)
    {
        var totalStepMinutes = (Math.Max(0, config.IntervalHours) * 60) + Math.Max(0, config.IntervalMinutes);
        if (totalStepMinutes <= 0) totalStepMinutes = 60; // default 1 hour

        // Start baseline at today's start hour:minute or midnight
        var cand = iranNow.Date.AddHours(config.Hour).AddMinutes(config.Minute);
        if (cand > iranNow)
        {
            return cand;
        }

        // Advance forward step by step until > iranNow
        while (cand <= iranNow)
        {
            cand = cand.AddMinutes(totalStepMinutes);
        }

        return cand;
    }

    private static DateTime? CalculateDaily(ScheduleConfigModel config, DateTime iranNow)
    {
        int intervalDays = Math.Max(1, config.IntervalDays);
        bool workdaysOnly = config.WorkdaysOnly;

        DateTime candDate = iranNow.Date;
        DateTime cand = candDate.AddHours(config.Hour).AddMinutes(config.Minute);

        // Check up to 100 days ahead
        for (int i = 0; i < 100; i++)
        {
            if (cand > iranNow)
            {
                if (workdaysOnly)
                {
                    // In Iran: Workdays are Saturday (6), Sunday (0), Monday (1), Tuesday (2), Wednesday (3)
                    // Thursday (4) and Friday (5) are weekend / off
                    var dow = cand.DayOfWeek;
                    if (dow == DayOfWeek.Saturday || dow == DayOfWeek.Sunday ||
                        dow == DayOfWeek.Monday || dow == DayOfWeek.Tuesday ||
                        dow == DayOfWeek.Wednesday)
                    {
                        return cand;
                    }
                }
                else
                {
                    return cand;
                }
            }

            candDate = candDate.AddDays(workdaysOnly ? 1 : intervalDays);
            cand = candDate.AddHours(config.Hour).AddMinutes(config.Minute);
        }

        return null;
    }

    private static DateTime? CalculateWeekly(ScheduleConfigModel config, DateTime iranNow)
    {
        var days = (config.DaysOfWeek ?? new List<string>())
            .Select(NormalizeDayOfWeek)
            .Where(d => d.HasValue)
            .Select(d => d!.Value)
            .ToHashSet();

        if (days.Count == 0)
        {
            // Default to Saturday if none chosen
            days.Add(DayOfWeek.Saturday);
        }

        DateTime candDate = iranNow.Date;
        for (int dayOffset = 0; dayOffset <= 365; dayOffset++)
        {
            var date = candDate.AddDays(dayOffset);
            if (days.Contains(date.DayOfWeek))
            {
                var cand = date.AddHours(config.Hour).AddMinutes(config.Minute);
                if (cand > iranNow)
                {
                    return cand;
                }
            }
        }

        return null;
    }

    private static DateTime? CalculateMonthly(ScheduleConfigModel config, DateTime iranNow)
    {
        var targetDays = (config.DaysOfMonth ?? new List<int>())
            .Where(d => d >= 1 && d <= 31)
            .ToHashSet();

        if (targetDays.Count == 0 && !config.LastDayOfMonth)
        {
            targetDays.Add(1); // Default 1st of month
        }

        DateTime candDate = iranNow.Date;
        for (int dayOffset = 0; dayOffset <= 400; dayOffset++)
        {
            var date = candDate.AddDays(dayOffset);

            // Month check (if specified)
            if (config.Months != null && config.Months.Count > 0 && !config.Months.Contains(date.Month))
            {
                continue;
            }

            bool dayMatches = targetDays.Contains(date.Day);
            if (!dayMatches && config.LastDayOfMonth)
            {
                var daysInMonth = DateTime.DaysInMonth(date.Year, date.Month);
                if (date.Day == daysInMonth) dayMatches = true;
            }

            if (dayMatches)
            {
                var cand = date.AddHours(config.Hour).AddMinutes(config.Minute);
                if (cand > iranNow)
                {
                    return cand;
                }
            }
        }

        return null;
    }

    private static DayOfWeek? NormalizeDayOfWeek(string day)
    {
        if (string.IsNullOrWhiteSpace(day)) return null;
        var s = day.Trim().ToLowerInvariant();
        return s switch
        {
            "saturday" or "sat" or "شنبه" => DayOfWeek.Saturday,
            "sunday" or "sun" or "یکشنبه" => DayOfWeek.Sunday,
            "monday" or "mon" or "دوشنبه" => DayOfWeek.Monday,
            "tuesday" or "tue" or "سه‌شنبه" or "سه شنبه" => DayOfWeek.Tuesday,
            "wednesday" or "wed" or "چهارشنبه" => DayOfWeek.Wednesday,
            "thursday" or "thu" or "پنج‌شنبه" or "پنج شنبه" => DayOfWeek.Thursday,
            "friday" or "fri" or "جمعه" => DayOfWeek.Friday,
            _ => null
        };
    }

    private static DateTime? ParseDateToIranLocal(string? dateStr)
    {
        if (string.IsNullOrWhiteSpace(dateStr)) return null;
        var s = dateStr.Trim();

        // 1. Try standard ISO/Gregorian date YYYY-MM-DD
        if (DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
        {
            return dt.Date;
        }

        // 2. Try Persian date 1405/01/01 or 1405-01-01
        var parts = s.Split(new[] { '/', '-' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 3 &&
            int.TryParse(parts[0], out var py) &&
            int.TryParse(parts[1], out var pm) &&
            int.TryParse(parts[2], out var pd))
        {
            if (py >= 1300 && py <= 1500 && pm >= 1 && pm <= 12 && pd >= 1 && pd <= 31)
            {
                try
                {
                    return Pc.ToDateTime(py, pm, pd, 0, 0, 0, 0);
                }
                catch { }
            }
        }

        return null;
    }

    private static ScheduleConfigModel ConvertLegacyToConfig(string type, string? val)
    {
        var model = new ScheduleConfigModel();
        if (type == "IntervalMinutes" && int.TryParse(val, out var mins) && mins > 0)
        {
            model.Frequency = "Hour";
            model.IntervalHours = mins / 60;
            model.IntervalMinutes = mins % 60;
            if (model.IntervalHours == 0 && model.IntervalMinutes == 0) model.IntervalMinutes = 15;
            return model;
        }

        if (type == "DailyTime" && !string.IsNullOrWhiteSpace(val))
        {
            var parts = val.Split(':');
            if (parts.Length == 2 && int.TryParse(parts[0], out var h) && int.TryParse(parts[1], out var m))
            {
                model.Frequency = "Day";
                model.IntervalDays = 1;
                model.Hour = h;
                model.Minute = m;
                return model;
            }
        }

        model.Frequency = "None";
        return model;
    }
}
