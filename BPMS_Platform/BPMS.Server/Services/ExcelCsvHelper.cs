using System.Globalization;
using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using BPMS.Server.DTOs;

namespace BPMS.Server.Services;

public class ParsedTabularSheet
{
    public List<string> SheetNames { get; set; } = new();
    public string SelectedSheetName { get; set; } = string.Empty;
    public List<string> Headers { get; set; } = new();
    public List<Dictionary<string, object?>> Rows { get; set; } = new();
}

public static class ExcelCsvHelper
{
    static ExcelCsvHelper()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }

    private static readonly HashSet<int> BuiltInDateNumFmtIds = new()
    {
        14, 15, 16, 17, 18, 19, 20, 21, 22,
        27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
        45, 46, 47,
        50, 51, 52, 53, 54, 55, 56, 57, 58
    };

    private static readonly Dictionary<string, string> PersianWordMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["کد"] = "Code", ["كد"] = "Code", ["شناسه"] = "Id", ["ایدی"] = "Id", ["آیدی"] = "Id",
        ["نام"] = "Name", ["عنوان"] = "Title", ["کالا"] = "Product", ["محصول"] = "Product",
        ["مشتری"] = "Customer", ["خریدار"] = "Buyer", ["فروشنده"] = "Vendor", ["تامین"] = "Supplier",
        ["قیمت"] = "Price", ["فی"] = "UnitPrice", ["مبلغ"] = "Amount", ["تعداد"] = "Qty",
        ["مقدار"] = "Qty", ["واحد"] = "Unit", ["تاریخ"] = "Date", ["زمان"] = "Time", ["ساعت"] = "Time",
        ["شماره"] = "Number", ["تلفن"] = "Phone", ["موبایل"] = "Mobile", ["همراه"] = "Mobile",
        ["ایمیل"] = "Email", ["آدرس"] = "Address", ["نشانی"] = "Address", ["ملی"] = "National",
        ["پستی"] = "Postal", ["مرکز"] = "Center", ["هزینه"] = "Cost", ["دپارتمان"] = "Department",
        ["سازمانی"] = "Org", ["پرسنل"] = "Staff", ["کارمند"] = "Employee", ["کاربر"] = "User",
        ["شعبه"] = "Branch", ["انبار"] = "Warehouse", ["گروه"] = "Group", ["دسته"] = "Category",
        ["نوع"] = "Type", ["وضعیت"] = "Status", ["توضیحات"] = "Description", ["شرح"] = "Description",
        ["درصد"] = "Percent", ["مالیات"] = "Tax", ["تخفیف"] = "Discount", ["جمع"] = "Total",
        ["کل"] = "Total", ["حساب"] = "Account", ["پروژه"] = "Project", ["بانک"] = "Bank",
        ["شهر"] = "City", ["استان"] = "Province", ["کشور"] = "Country", ["فعال"] = "Active",
        ["ردیف"] = "RowNo", ["شبا"] = "Iban", ["سفارش"] = "Order", ["فاکتور"] = "Invoice",
        ["قرارداد"] = "Contract", ["شرکت"] = "Company", ["مدل"] = "Model", ["برند"] = "Brand",
        ["وزن"] = "Weight", ["موجودی"] = "Stock", ["حداقل"] = "Min", ["حداکثر"] = "Max"
    };

    private static readonly Dictionary<char, string> PersianCharMap = new()
    {
        ['آ'] = "A", ['ا'] = "A", ['أ'] = "A", ['إ'] = "E", ['ب'] = "B", ['پ'] = "P",
        ['ت'] = "T", ['ط'] = "T", ['ث'] = "S", ['س'] = "S", ['ص'] = "S",
        ['ج'] = "J", ['چ'] = "Ch", ['ح'] = "H", ['ه'] = "H", ['ة'] = "H", ['خ'] = "Kh",
        ['د'] = "D", ['ذ'] = "Z", ['ز'] = "Z", ['ض'] = "Z", ['ظ'] = "Z",
        ['ر'] = "R", ['ژ'] = "Zh", ['ش'] = "Sh", ['ع'] = "A", ['غ'] = "Gh", ['ق'] = "Gh",
        ['ف'] = "F", ['ک'] = "K", ['ك'] = "K", ['گ'] = "G", ['ل'] = "L",
        ['م'] = "M", ['ن'] = "N", ['و'] = "V", ['ؤ'] = "V", ['ی'] = "Y", ['ي'] = "Y", ['ئ'] = "Y",
        ['۰'] = "0", ['۱'] = "1", ['۲'] = "2", ['۳'] = "3", ['۴'] = "4",
        ['۵'] = "5", ['۶'] = "6", ['۷'] = "7", ['۸'] = "8", ['۹'] = "9",
        ['٠'] = "0", ['١'] = "1", ['٢'] = "2", ['٣'] = "3", ['٤'] = "4",
        ['٥'] = "5", ['٦'] = "6", ['٧'] = "7", ['٨'] = "8", ['٩'] = "9"
    };

    /// <summary>
    /// Parses an uploaded CSV, XLSX, or XLS stream into a list of row dictionaries.
    /// </summary>
    public static List<Dictionary<string, object?>> ParseFile(Stream stream, string fileName, string? sheetName = null)
    {
        return ParseWorkbook(stream, fileName, sheetName).Rows;
    }

    /// <summary>
    /// Parses an uploaded CSV, XLSX, or XLS stream and returns sheet metadata, headers, and rows.
    /// </summary>
    public static ParsedTabularSheet ParseWorkbook(Stream stream, string fileName, string? sheetName = null)
    {
        using var ms = new MemoryStream();
        stream.CopyTo(ms);
        if (ms.Length == 0)
        {
            throw new InvalidOperationException("فایل انتخاب‌شده خالی است.");
        }

        ms.Position = 0;
        var bytes = ms.ToArray();
        var ext = Path.GetExtension(fileName ?? string.Empty).ToLowerInvariant();

        // 1. ZIP / OpenXML (.xlsx or .xlsx saved with .xls extension)
        if (bytes.Length >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B && bytes[2] == 0x03 && bytes[3] == 0x04)
        {
            ms.Position = 0;
            return ParseXlsx(ms, sheetName);
        }

        // 2. OLE2 Compound File (.xls BIFF8)
        if (bytes.Length >= 8 &&
            bytes[0] == 0xD0 && bytes[1] == 0xCF && bytes[2] == 0x11 && bytes[3] == 0xE0 &&
            bytes[4] == 0xA1 && bytes[5] == 0xB1 && bytes[6] == 0x1A && bytes[7] == 0xE1)
        {
            return ParseBiff8Xls(bytes, sheetName);
        }

        // 3. Text-based formats: SpreadsheetML XML, HTML table (.xls), or CSV/TSV
        if (ext == ".csv" || ext == ".txt" || ext == ".xls" || ext == ".xml")
        {
            var text = DecodeTextWithFallback(bytes);
            var trimmedStart = text.TrimStart('\uFEFF', ' ', '\t', '\r', '\n');

            if (trimmedStart.StartsWith("<", StringComparison.Ordinal))
            {
                if (trimmedStart.Contains("<Workbook", StringComparison.OrdinalIgnoreCase) ||
                    trimmedStart.Contains("urn:schemas-microsoft-com:office:spreadsheet", StringComparison.OrdinalIgnoreCase))
                {
                    return ParseSpreadsheetMlXml(text, sheetName);
                }

                if (trimmedStart.Contains("<table", StringComparison.OrdinalIgnoreCase) ||
                    trimmedStart.Contains("<html", StringComparison.OrdinalIgnoreCase))
                {
                    return ParseHtmlTable(text);
                }
            }

            if (ext == ".csv" || ext == ".txt" || ext == ".xls")
            {
                return ParseCsvText(text);
            }
        }

        if (ext == ".xlsx")
        {
            throw new InvalidOperationException("ساختار فایل .xlsx معتبر نیست یا فایل آسیب دیده است.");
        }

        throw new NotSupportedException("فرمت فایل ارسالی پشتیبانی نمی‌شود. لطفاً فایل معتبر با پسوند .xlsx، .xls یا .csv بارگذاری نمایید.");
    }

    /// <summary>
    /// Builds rich preview metadata (sheets, suggested column codes/types, 10 sample rows, and full-dataset key validation).
    /// </summary>
    public static ExcelPreviewResultDto BuildPreview(Stream stream, string fileName, string? sheetName = null)
    {
        var parsed = ParseWorkbook(stream, fileName, sheetName);
        if (parsed.Headers.Count == 0)
        {
            throw new InvalidOperationException("هیچ سرستون معتبری در شیت انتخاب‌شده یافت نشد.");
        }

        var usedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var columns = new List<ExcelPreviewColumnDto>();
        var columnStats = new Dictionary<string, ExcelColumnValidationDto>(StringComparer.Ordinal);

        for (int idx = 0; idx < parsed.Headers.Count; idx++)
        {
            var header = parsed.Headers[idx];
            var colCode = GenerateLatinColumnCode(header, idx, usedCodes);
            usedCodes.Add(colCode);

            var valuesForType = new List<string>();
            var emptySampleRows = new List<int>();
            var duplicateValues = new List<string>();
            var duplicateSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenValues = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            int emptyCount = 0;
            int duplicateCount = 0;

            for (int rIdx = 0; rIdx < parsed.Rows.Count; rIdx++)
            {
                parsed.Rows[rIdx].TryGetValue(header, out var raw);
                var str = raw?.ToString()?.Trim() ?? string.Empty;

                if (string.IsNullOrWhiteSpace(str))
                {
                    emptyCount++;
                    if (emptySampleRows.Count < 5)
                    {
                        emptySampleRows.Add(rIdx + 1);
                    }
                }
                else
                {
                    if (valuesForType.Count < 200)
                    {
                        valuesForType.Add(str);
                    }

                    if (!seenValues.Add(str))
                    {
                        duplicateCount++;
                        if (duplicateSet.Add(str) && duplicateValues.Count < 5)
                        {
                            duplicateValues.Add(str);
                        }
                    }
                }
            }

            columns.Add(new ExcelPreviewColumnDto
            {
                SourceHeader = header,
                SuggestedName = colCode,
                SuggestedTitle = header,
                SuggestedDataType = DetectColumnDataType(valuesForType, header)
            });

            columnStats[header] = new ExcelColumnValidationDto
            {
                EmptyCount = emptyCount,
                DuplicateCount = duplicateCount,
                SampleEmptyRowNumbers = emptySampleRows,
                SampleDuplicateValues = duplicateValues
            };
        }

        return new ExcelPreviewResultDto
        {
            Success = true,
            FileName = Path.GetFileName(fileName ?? string.Empty),
            SheetNames = parsed.SheetNames,
            SelectedSheetName = parsed.SelectedSheetName,
            Columns = columns,
            TotalRows = parsed.Rows.Count,
            PreviewRows = parsed.Rows.Take(10).ToList(),
            ColumnStats = columnStats
        };
    }

    /// <summary>
    /// Generates sample CSV template bytes with UTF-8 BOM so Persian titles render properly in Excel.
    /// </summary>
    public static byte[] GenerateSampleCsvTemplate(List<TableColumnDef> columns, string uniqueKeyCol)
    {
        var sb = new StringBuilder();

        var headers = columns.Select(c => EscapeCsv(c.Name));
        sb.AppendLine(string.Join(",", headers));

        var row1 = columns.Select(c =>
        {
            if (c.Name.Equals(uniqueKeyCol, StringComparison.OrdinalIgnoreCase))
                return EscapeCsv("1001");
            if (c.DataType == "number")
                return "150000";
            if (c.DataType == "date")
                return "1403/08/15";
            return EscapeCsv($"نمونه {c.Title}");
        });
        sb.AppendLine(string.Join(",", row1));

        var row2 = columns.Select(c =>
        {
            if (c.Name.Equals(uniqueKeyCol, StringComparison.OrdinalIgnoreCase))
                return EscapeCsv("1002");
            if (c.DataType == "number")
                return "250000";
            if (c.DataType == "date")
                return "1403/09/20";
            return EscapeCsv($"داده دوم {c.Title}");
        });
        sb.AppendLine(string.Join(",", row2));

        var preamble = Encoding.UTF8.GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        var result = new byte[preamble.Length + body.Length];
        Buffer.BlockCopy(preamble, 0, result, 0, preamble.Length);
        Buffer.BlockCopy(body, 0, result, preamble.Length, body.Length);
        return result;
    }

    private static string EscapeCsv(string val)
    {
        if (string.IsNullOrEmpty(val)) return "";
        if (val.Contains(',') || val.Contains('\"') || val.Contains('\n') || val.Contains('\r'))
        {
            return $"\"{val.Replace("\"", "\"\"")}\"";
        }
        return val;
    }

    #region Column Code & Type Inference

    private static string GenerateLatinColumnCode(string header, int colIndex, HashSet<string> usedCodes)
    {
        var trimmed = (header ?? string.Empty).Trim();
        string candidate;

        if (Regex.IsMatch(trimmed, @"^[A-Za-z_][A-Za-z0-9_]*$"))
        {
            candidate = trimmed;
        }
        else
        {
            var tokens = Regex.Split(trimmed, @"[\s\-_/\\()\[\].,:;+]+")
                .Where(t => !string.IsNullOrWhiteSpace(t))
                .ToList();

            var mappedParts = new List<string>();
            foreach (var token in tokens)
            {
                if (PersianWordMap.TryGetValue(token, out var englishWord))
                {
                    mappedParts.Add(englishWord);
                }
                else if (Regex.IsMatch(token, @"^[A-Za-z0-9]+$"))
                {
                    mappedParts.Add(char.ToUpperInvariant(token[0]) + token.Substring(1));
                }
                else
                {
                    var transliterated = TransliterateToken(token);
                    if (!string.IsNullOrEmpty(transliterated))
                    {
                        mappedParts.Add(transliterated);
                    }
                }
            }

            candidate = string.Join("_", mappedParts.Where(p => !string.IsNullOrEmpty(p)));
            candidate = Regex.Replace(candidate, @"[^A-Za-z0-9_]", "");
            candidate = Regex.Replace(candidate, @"_+", "_").Trim('_');

            if (string.IsNullOrEmpty(candidate))
            {
                candidate = $"Col_{colIndex + 1}";
            }
            else if (char.IsDigit(candidate[0]))
            {
                candidate = $"Col_{candidate}";
            }
        }

        var unique = candidate;
        int suffix = 2;
        while (usedCodes.Contains(unique))
        {
            unique = $"{candidate}_{suffix++}";
        }
        return unique;
    }

    private static string TransliterateToken(string token)
    {
        var sb = new StringBuilder();
        foreach (char ch in token)
        {
            if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9'))
            {
                sb.Append(ch);
            }
            else if (PersianCharMap.TryGetValue(ch, out var mapped))
            {
                sb.Append(mapped);
            }
        }
        var res = sb.ToString();
        if (res.Length > 0 && char.IsLetter(res[0]))
        {
            res = char.ToUpperInvariant(res[0]) + res.Substring(1).ToLowerInvariant();
        }
        return res;
    }

    private static string DetectColumnDataType(List<string> samples, string header)
    {
        if (samples.Count == 0) return "string";

        int dateMatches = 0;
        int numberMatches = 0;
        bool hasLeadingZeroCode = false;

        foreach (var raw in samples)
        {
            var s = NormalizeDigits(raw).Trim();
            if (string.IsNullOrEmpty(s)) continue;

            if (Regex.IsMatch(s, @"^0\d+$"))
            {
                hasLeadingZeroCode = true;
            }

            if (Regex.IsMatch(s, @"^\d{4}[/-]\d{1,2}[/-]\d{1,2}(\s+\d{1,2}:\d{2}(:\d{2})?)?$") ||
                Regex.IsMatch(s, @"^\d{1,2}[/-]\d{1,2}[/-]\d{4}$"))
            {
                dateMatches++;
                continue;
            }

            var cleanNum = s.Replace(",", "").Replace("٬", "");
            if (Regex.IsMatch(cleanNum, @"^-?\d+(\.\d+)?$") &&
                decimal.TryParse(cleanNum, NumberStyles.Any, CultureInfo.InvariantCulture, out _))
            {
                numberMatches++;
            }
        }

        int total = samples.Count;
        if (dateMatches * 100 >= total * 85)
        {
            return "date";
        }

        var h = (header ?? string.Empty).ToLowerInvariant();
        bool headerIsIdentifierOrPhone =
            h.Contains("تلفن") || h.Contains("موبایل") || h.Contains("همراه") ||
            h.Contains("ملی") || h.Contains("پستی") || h.Contains("شبا") ||
            h.Contains("کد") || h.Contains("كد") || h.Contains("شناسه") ||
            h.Contains("phone") || h.Contains("mobile") || h.Contains("national") ||
            h.Contains("postal") || h.Contains("code") || h.Contains("iban") || h.Contains("sku");

        if (!hasLeadingZeroCode && !headerIsIdentifierOrPhone && numberMatches * 100 >= total * 90)
        {
            return "number";
        }

        return "string";
    }

    private static string NormalizeDigits(string input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        var sb = new StringBuilder(input.Length);
        foreach (char c in input)
        {
            if (c >= '۰' && c <= '۹') sb.Append((char)('0' + (c - '۰')));
            else if (c >= '٠' && c <= '٩') sb.Append((char)('0' + (c - '٠')));
            else sb.Append(c);
        }
        return sb.ToString();
    }

    #endregion

    #region CSV / HTML / SpreadsheetML Parsers

    private static string DecodeTextWithFallback(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
            return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
            return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
            return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);

        try
        {
            var utf8Strict = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
            return utf8Strict.GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.GetEncoding(1256).GetString(bytes);
        }
    }

    private static ParsedTabularSheet ParseCsvText(string text)
    {
        var result = new ParsedTabularSheet
        {
            SheetNames = new List<string> { "Sheet1" },
            SelectedSheetName = "Sheet1"
        };

        var lines = ReadLogicalCsvLines(text);
        int headerLineIdx = lines.FindIndex(l => !string.IsNullOrWhiteSpace(l));
        if (headerLineIdx < 0) return result;

        string headerLine = lines[headerLineIdx];
        char separator = ',';
        if (!headerLine.Contains(',') && headerLine.Contains(';')) separator = ';';
        else if (!headerLine.Contains(',') && headerLine.Contains('\t')) separator = '\t';

        var rawHeaders = SplitCsvLine(headerLine, separator);
        var headers = DisambiguateHeaders(rawHeaders);
        if (headers.Count == 0) return result;

        result.Headers = headers;

        for (int lineIdx = headerLineIdx + 1; lineIdx < lines.Count; lineIdx++)
        {
            var line = lines[lineIdx];
            if (string.IsNullOrWhiteSpace(line)) continue;

            var values = SplitCsvLine(line, separator);
            var rowDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            bool hasData = false;

            for (int i = 0; i < headers.Count; i++)
            {
                var h = headers[i];
                var v = i < values.Count ? values[i] : null;
                if (!string.IsNullOrWhiteSpace(v)) hasData = true;
                rowDict[h] = string.IsNullOrEmpty(v) ? null : v;
            }

            if (hasData)
            {
                result.Rows.Add(rowDict);
            }
        }

        return result;
    }

    private static List<string> ReadLogicalCsvLines(string text)
    {
        var lines = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (c == '\"')
            {
                current.Append(c);
                if (inQuotes && i + 1 < text.Length && text[i + 1] == '\"')
                {
                    current.Append('\"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if ((c == '\r' || c == '\n') && !inQuotes)
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                {
                    i++;
                }
                lines.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        if (current.Length > 0)
        {
            lines.Add(current.ToString());
        }

        return lines;
    }

    private static List<string> SplitCsvLine(string line, char separator)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '\"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '\"')
                {
                    sb.Append('\"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == separator && !inQuotes)
            {
                result.Add(sb.ToString().Trim());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }
        result.Add(sb.ToString().Trim());
        return result;
    }

    private static ParsedTabularSheet ParseSpreadsheetMlXml(string xmlText, string? requestedSheetName)
    {
        var doc = XDocument.Parse(xmlText);
        XNamespace ss = "urn:schemas-microsoft-com:office:spreadsheet";

        var worksheets = doc.Descendants()
            .Where(e => e.Name.LocalName == "Worksheet")
            .ToList();

        if (worksheets.Count == 0)
        {
            throw new InvalidOperationException("هیچ کاربرگی (Sheet) در فایل XML یافت نشد.");
        }

        var sheetNames = worksheets
            .Select((ws, i) => ((string?)ws.Attribute(ss + "Name") ?? (string?)ws.Attribute("Name") ?? $"Sheet{i + 1}").Trim())
            .ToList();

        int targetIdx = 0;
        if (!string.IsNullOrWhiteSpace(requestedSheetName))
        {
            var foundIdx = sheetNames.FindIndex(n => n.Equals(requestedSheetName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (foundIdx >= 0) targetIdx = foundIdx;
        }

        var targetWs = worksheets[targetIdx];
        var grid = new List<Dictionary<int, string>>();

        var rowElems = targetWs.Descendants().Where(e => e.Name.LocalName == "Row").ToList();
        foreach (var rElem in rowElems)
        {
            var rowCells = new Dictionary<int, string>();
            int colIdx = 0;
            foreach (var cElem in rElem.Elements().Where(e => e.Name.LocalName == "Cell"))
            {
                var indexAttr = (string?)cElem.Attribute(ss + "Index") ?? (string?)cElem.Attribute("Index");
                if (int.TryParse(indexAttr, out int explicitIdx) && explicitIdx >= 1)
                {
                    colIdx = explicitIdx - 1;
                }

                var dataElem = cElem.Elements().FirstOrDefault(e => e.Name.LocalName == "Data");
                var val = dataElem?.Value?.Trim() ?? string.Empty;
                if (!string.IsNullOrEmpty(val))
                {
                    rowCells[colIdx] = val;
                }
                colIdx++;
            }

            if (rowCells.Count > 0)
            {
                grid.Add(rowCells);
            }
        }

        return BuildResultFromSparseGrid(sheetNames, sheetNames[targetIdx], grid);
    }

    private static ParsedTabularSheet ParseHtmlTable(string html)
    {
        var grid = new List<Dictionary<int, string>>();
        var rowMatches = Regex.Matches(html, @"<tr\b[^>]*>(.*?)</tr>", RegexOptions.IgnoreCase | RegexOptions.Singleline);

        foreach (Match rm in rowMatches)
        {
            var cellMatches = Regex.Matches(rm.Groups[1].Value, @"<t[hd]\b[^>]*>(.*?)</t[hd]>", RegexOptions.IgnoreCase | RegexOptions.Singleline);
            var rowCells = new Dictionary<int, string>();
            for (int cIdx = 0; cIdx < cellMatches.Count; cIdx++)
            {
                var inner = Regex.Replace(cellMatches[cIdx].Groups[1].Value, @"<[^>]+>", " ");
                var decoded = WebUtility.HtmlDecode(inner).Trim();
                if (!string.IsNullOrWhiteSpace(decoded))
                {
                    rowCells[cIdx] = decoded;
                }
            }
            if (rowCells.Count > 0)
            {
                grid.Add(rowCells);
            }
        }

        return BuildResultFromSparseGrid(new List<string> { "Sheet1" }, "Sheet1", grid);
    }

    #endregion

    #region XLSX (OpenXML) Parser

    private static ParsedTabularSheet ParseXlsx(MemoryStream ms, string? requestedSheetName)
    {
        using var archive = new ZipArchive(ms, ZipArchiveMode.Read, leaveOpen: true);

        // 1. Read shared strings
        var sharedStrings = new List<string>();
        var sharedStringsEntry = archive.GetEntry("xl/sharedStrings.xml");
        if (sharedStringsEntry != null)
        {
            using var entryStream = sharedStringsEntry.Open();
            var doc = XDocument.Load(entryStream);
            XNamespace ns = doc.Root?.Name.Namespace ?? XNamespace.None;

            foreach (var si in doc.Descendants(ns + "si"))
            {
                var textElements = si.Descendants(ns + "t").Select(t => t.Value);
                sharedStrings.Add(string.Concat(textElements));
            }
        }

        // 2. Read styles for date detection
        var dateXfIndices = ParseXlsxDateStyleIndices(archive);

        // 3. Discover workbook sheets in exact order
        var sheets = DiscoverXlsxSheets(archive);
        if (sheets.Count == 0)
        {
            return new ParsedTabularSheet();
        }

        var sheetNames = sheets.Select(s => s.Name).ToList();
        var chosen = sheets[0];
        if (!string.IsNullOrWhiteSpace(requestedSheetName))
        {
            var matched = sheets.FirstOrDefault(s => s.Name.Equals(requestedSheetName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(matched.EntryPath))
            {
                chosen = matched;
            }
        }

        var sheetEntry = archive.GetEntry(chosen.EntryPath);
        if (sheetEntry == null)
        {
            return new ParsedTabularSheet
            {
                SheetNames = sheetNames,
                SelectedSheetName = chosen.Name
            };
        }

        using var sheetStream = sheetEntry.Open();
        var sheetDoc = XDocument.Load(sheetStream);
        XNamespace sheetNs = sheetDoc.Root?.Name.Namespace ?? XNamespace.None;

        var rowElements = sheetDoc.Descendants(sheetNs + "row")
            .OrderBy(r => (int?)r.Attribute("r") ?? 0)
            .ToList();

        var grid = new List<Dictionary<int, string>>();
        foreach (var r in rowElements)
        {
            var rowCells = new Dictionary<int, string>();
            int fallbackCol = 0;
            foreach (var c in r.Elements(sheetNs + "c"))
            {
                var cellRef = (string?)c.Attribute("r") ?? "";
                int colIdx = !string.IsNullOrEmpty(cellRef) ? GetColumnIndexFromCellReference(cellRef) : fallbackCol;
                fallbackCol = colIdx + 1;

                var val = GetXlsxCellValue(c, sheetNs, sharedStrings, dateXfIndices);
                if (!string.IsNullOrWhiteSpace(val))
                {
                    rowCells[colIdx] = val.Trim();
                }
            }

            if (rowCells.Count > 0)
            {
                grid.Add(rowCells);
            }
        }

        return BuildResultFromSparseGrid(sheetNames, chosen.Name, grid);
    }

    private static List<(string Name, string EntryPath)> DiscoverXlsxSheets(ZipArchive archive)
    {
        var sheets = new List<(string Name, string EntryPath)>();
        var workbookEntry = archive.GetEntry("xl/workbook.xml");
        var relsEntry = archive.GetEntry("xl/_rels/workbook.xml.rels");

        if (workbookEntry != null)
        {
            var relMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (relsEntry != null)
            {
                using var relStream = relsEntry.Open();
                var relDoc = XDocument.Load(relStream);
                foreach (var rel in relDoc.Descendants().Where(e => e.Name.LocalName == "Relationship"))
                {
                    var id = (string?)rel.Attribute("Id");
                    var target = (string?)rel.Attribute("Target");
                    if (!string.IsNullOrEmpty(id) && !string.IsNullOrEmpty(target))
                    {
                        var normalized = target.TrimStart('/').Replace('\\', '/');
                        if (!normalized.StartsWith("xl/", StringComparison.OrdinalIgnoreCase))
                        {
                            normalized = "xl/" + normalized.TrimStart('/');
                        }
                        relMap[id] = normalized;
                    }
                }
            }

            using var wbStream = workbookEntry.Open();
            var wbDoc = XDocument.Load(wbStream);
            int idx = 1;
            foreach (var sh in wbDoc.Descendants().Where(e => e.Name.LocalName == "sheet"))
            {
                var name = ((string?)sh.Attribute("name") ?? $"Sheet{idx}").Trim();
                var rId = sh.Attributes().FirstOrDefault(a => a.Name.LocalName == "id")?.Value;
                string? targetPath = null;

                if (!string.IsNullOrEmpty(rId) && relMap.TryGetValue(rId, out var mappedPath))
                {
                    targetPath = mappedPath;
                }
                else
                {
                    targetPath = $"xl/worksheets/sheet{idx}.xml";
                }

                if (archive.GetEntry(targetPath) != null)
                {
                    sheets.Add((name, targetPath));
                }
                idx++;
            }
        }

        if (sheets.Count == 0)
        {
            var fallbackEntries = archive.Entries
                .Where(e => e.FullName.StartsWith("xl/worksheets/sheet", StringComparison.OrdinalIgnoreCase) &&
                            e.FullName.EndsWith(".xml", StringComparison.OrdinalIgnoreCase))
                .OrderBy(e => e.FullName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            for (int i = 0; i < fallbackEntries.Count; i++)
            {
                sheets.Add(($"Sheet{i + 1}", fallbackEntries[i].FullName));
            }
        }

        return sheets;
    }

    private static HashSet<int> ParseXlsxDateStyleIndices(ZipArchive archive)
    {
        var dateXfs = new HashSet<int>();
        var stylesEntry = archive.GetEntry("xl/styles.xml");
        if (stylesEntry == null) return dateXfs;

        try
        {
            using var stream = stylesEntry.Open();
            var doc = XDocument.Load(stream);
            var customDateFmtIds = new HashSet<int>();

            foreach (var nf in doc.Descendants().Where(e => e.Name.LocalName == "numFmt"))
            {
                if (int.TryParse((string?)nf.Attribute("numFmtId"), out int fmtId))
                {
                    var fmtCode = (string?)nf.Attribute("formatCode") ?? string.Empty;
                    if (IsExcelDateFormatCode(fmtCode))
                    {
                        customDateFmtIds.Add(fmtId);
                    }
                }
            }

            var cellXfsElem = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "cellXfs");
            if (cellXfsElem != null)
            {
                int idx = 0;
                foreach (var xf in cellXfsElem.Elements().Where(e => e.Name.LocalName == "xf"))
                {
                    if (int.TryParse((string?)xf.Attribute("numFmtId"), out int fmtId))
                    {
                        if (BuiltInDateNumFmtIds.Contains(fmtId) || customDateFmtIds.Contains(fmtId))
                        {
                            dateXfs.Add(idx);
                        }
                    }
                    idx++;
                }
            }
        }
        catch
        {
            // Ignore malformed style metadata gracefully
        }

        return dateXfs;
    }

    private static bool IsExcelDateFormatCode(string formatCode)
    {
        if (string.IsNullOrWhiteSpace(formatCode)) return false;
        var clean = Regex.Replace(formatCode, "\"[^\"]*\"", "");
        clean = Regex.Replace(clean, @"\[[^\]]*\]", "");
        clean = clean.ToLowerInvariant();
        if (clean.Contains('0') || clean.Contains('#') || clean.Contains('%')) return false;
        return clean.Contains('y') || clean.Contains('d') || (clean.Contains('m') && clean.Contains('h'));
    }

    private static string GetXlsxCellValue(XElement c, XNamespace ns, List<string> sharedStrings, HashSet<int> dateXfIndices)
    {
        var typeAttr = (string?)c.Attribute("t");
        var styleAttr = (string?)c.Attribute("s");
        var valElem = c.Element(ns + "v");
        var val = valElem?.Value ?? "";

        if (typeAttr == "s")
        {
            if (int.TryParse(val, out int idx) && idx >= 0 && idx < sharedStrings.Count)
            {
                return sharedStrings[idx];
            }
            return "";
        }
        if (typeAttr == "inlineStr")
        {
            var isElem = c.Element(ns + "is");
            if (isElem == null) return "";
            var texts = isElem.Descendants(ns + "t").Select(t => t.Value);
            return string.Concat(texts);
        }
        if (typeAttr == "str")
        {
            return val;
        }
        if (typeAttr == "b")
        {
            return val == "1" ? "true" : "false";
        }
        if (typeAttr == "e")
        {
            return "";
        }

        if (!string.IsNullOrEmpty(val))
        {
            if (int.TryParse(styleAttr, out int xfIdx) && dateXfIndices.Contains(xfIdx) &&
                double.TryParse(val, NumberStyles.Any, CultureInfo.InvariantCulture, out double oaDate) &&
                oaDate >= 1 && oaDate < 2958466)
            {
                return FormatExcelSerialDate(oaDate);
            }

            if (decimal.TryParse(val, NumberStyles.Any, CultureInfo.InvariantCulture, out decimal decVal))
            {
                return decVal.ToString("G29", CultureInfo.InvariantCulture);
            }
            if (double.TryParse(val, NumberStyles.Any, CultureInfo.InvariantCulture, out double dblVal))
            {
                return dblVal.ToString("G15", CultureInfo.InvariantCulture);
            }
        }

        return val;
    }

    private static string FormatExcelSerialDate(double oaDate)
    {
        var dt = DateTime.FromOADate(oaDate);
        if (Math.Abs(oaDate - Math.Truncate(oaDate)) < 0.0001)
        {
            return dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }
        return dt.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
    }

    private static int GetColumnIndexFromCellReference(string cellRef)
    {
        var match = Regex.Match(cellRef, @"^[A-Za-z]+");
        if (!match.Success) return 0;

        string colLetters = match.Value.ToUpperInvariant();
        int sum = 0;
        for (int i = 0; i < colLetters.Length; i++)
        {
            sum *= 26;
            sum += (colLetters[i] - 'A' + 1);
        }
        return sum - 1;
    }

    #endregion

    #region Legacy XLS (OLE2 Compound + BIFF8) Parser

    private static ParsedTabularSheet ParseBiff8Xls(byte[] fileBytes, string? requestedSheetName)
    {
        var workbookBytes = ExtractOle2WorkbookStream(fileBytes);
        if (workbookBytes.Length < 8)
        {
            throw new InvalidOperationException("ساختار باینری فایل .xls معتبر نیست.");
        }

        int codepage = 1252;
        var sheets = new List<(string Name, uint Offset)>();
        var sst = new List<string>();
        var customDateFmtIds = new HashSet<int>();
        var dateXfIndices = new HashSet<int>();
        int xfCounter = 0;

        // 1. Parse Globals substream
        int pos = 0;
        int bofDepth = 0;
        while (pos + 4 <= workbookBytes.Length)
        {
            ushort recId = BitConverter.ToUInt16(workbookBytes, pos);
            ushort len = BitConverter.ToUInt16(workbookBytes, pos + 2);
            int dataStart = pos + 4;
            if (dataStart + len > workbookBytes.Length) break;

            if (recId == 0x0809 || recId == 0x0009 || recId == 0x0209 || recId == 0x0409)
            {
                bofDepth++;
            }
            else if (recId == 0x000A) // EOF
            {
                bofDepth--;
                if (bofDepth <= 0) break;
            }
            else if (recId == 0x0042 && len >= 2) // CODEPAGE
            {
                codepage = BitConverter.ToUInt16(workbookBytes, dataStart);
            }
            else if (recId == 0x0085 && len >= 8) // BOUNDSHEET
            {
                uint offset = BitConverter.ToUInt32(workbookBytes, dataStart);
                byte sheetType = workbookBytes[dataStart + 5];
                if (sheetType == 0x00) // Worksheet only
                {
                    string name = ReadBiff8ShortString(workbookBytes, dataStart + 6, len - 6, codepage).Trim();
                    if (string.IsNullOrEmpty(name)) name = $"Sheet{sheets.Count + 1}";
                    sheets.Add((name, offset));
                }
            }
            else if (recId == 0x041E && len >= 5) // FORMAT
            {
                int fmtId = BitConverter.ToUInt16(workbookBytes, dataStart);
                string fmtCode = ReadBiff8LongString(workbookBytes, dataStart + 2, len - 2, codepage);
                if (IsExcelDateFormatCode(fmtCode))
                {
                    customDateFmtIds.Add(fmtId);
                }
            }
            else if (recId == 0x00E0 && len >= 4) // XF
            {
                int fmtId = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                if (BuiltInDateNumFmtIds.Contains(fmtId) || customDateFmtIds.Contains(fmtId))
                {
                    dateXfIndices.Add(xfCounter);
                }
                xfCounter++;
            }
            else if (recId == 0x00FC && len >= 8) // SST (possibly followed by CONTINUE 0x003C)
            {
                var chunks = new List<(int Start, int Length)> { (dataStart, len) };
                int scanPos = dataStart + len;
                while (scanPos + 4 <= workbookBytes.Length)
                {
                    ushort nextId = BitConverter.ToUInt16(workbookBytes, scanPos);
                    ushort nextLen = BitConverter.ToUInt16(workbookBytes, scanPos + 2);
                    if (nextId != 0x003C || scanPos + 4 + nextLen > workbookBytes.Length) break;
                    chunks.Add((scanPos + 4, nextLen));
                    scanPos += 4 + nextLen;
                }
                sst = ParseBiff8Sst(workbookBytes, chunks, codepage);
                pos = scanPos;
                continue;
            }

            pos = dataStart + len;
        }

        if (sheets.Count == 0)
        {
            throw new InvalidOperationException("هیچ کاربرگی (Sheet) در فایل .xls یافت نشد.");
        }

        var sheetNames = sheets.Select(s => s.Name).ToList();
        var chosen = sheets[0];
        if (!string.IsNullOrWhiteSpace(requestedSheetName))
        {
            var matched = sheets.FirstOrDefault(s => s.Name.Equals(requestedSheetName.Trim(), StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrEmpty(matched.Name))
            {
                chosen = matched;
            }
        }

        // 2. Parse selected worksheet substream
        var rowDict = new SortedDictionary<int, Dictionary<int, string>>();
        pos = (int)chosen.Offset;
        bofDepth = 0;
        (int Row, int Col)? pendingFormulaStringCell = null;

        while (pos + 4 <= workbookBytes.Length)
        {
            ushort recId = BitConverter.ToUInt16(workbookBytes, pos);
            ushort len = BitConverter.ToUInt16(workbookBytes, pos + 2);
            int dataStart = pos + 4;
            if (dataStart + len > workbookBytes.Length) break;

            if (recId == 0x0809 || recId == 0x0009 || recId == 0x0209 || recId == 0x0409)
            {
                bofDepth++;
            }
            else if (recId == 0x000A) // EOF
            {
                bofDepth--;
                if (bofDepth <= 0) break;
            }
            else if (bofDepth == 1)
            {
                if (recId == 0x0207 && pendingFormulaStringCell.HasValue) // STRING following FORMULA
                {
                    var strVal = ReadBiff8LongString(workbookBytes, dataStart, len, codepage);
                    SetGridCell(rowDict, pendingFormulaStringCell.Value.Row, pendingFormulaStringCell.Value.Col, strVal);
                    pendingFormulaStringCell = null;
                }
                else
                {
                    pendingFormulaStringCell = null;

                    switch (recId)
                    {
                        case 0x00FD when len >= 10: // LABELSST
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            int sstIdx = BitConverter.ToInt32(workbookBytes, dataStart + 6);
                            if (sstIdx >= 0 && sstIdx < sst.Count)
                            {
                                SetGridCell(rowDict, r, c, sst[sstIdx]);
                            }
                            break;
                        }
                        case 0x0204 when len >= 8: // LABEL
                        case 0x00D6 when len >= 8: // RSTRING
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            var val = ReadBiff8LongString(workbookBytes, dataStart + 6, len - 6, codepage);
                            SetGridCell(rowDict, r, c, val);
                            break;
                        }
                        case 0x0203 when len >= 14: // NUMBER
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            int xf = BitConverter.ToUInt16(workbookBytes, dataStart + 4);
                            double num = BitConverter.ToDouble(workbookBytes, dataStart + 6);
                            SetGridCell(rowDict, r, c, FormatBiffNumber(num, xf, dateXfIndices));
                            break;
                        }
                        case 0x027E when len >= 10: // RK
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            int xf = BitConverter.ToUInt16(workbookBytes, dataStart + 4);
                            uint rk = BitConverter.ToUInt32(workbookBytes, dataStart + 6);
                            SetGridCell(rowDict, r, c, FormatBiffNumber(DecodeRk(rk), xf, dateXfIndices));
                            break;
                        }
                        case 0x00BD when len >= 12: // MULRK
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int cFirst = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            int count = (len - 6) / 6;
                            for (int i = 0; i < count; i++)
                            {
                                int offset = dataStart + 4 + (i * 6);
                                int xf = BitConverter.ToUInt16(workbookBytes, offset);
                                uint rk = BitConverter.ToUInt32(workbookBytes, offset + 2);
                                SetGridCell(rowDict, r, cFirst + i, FormatBiffNumber(DecodeRk(rk), xf, dateXfIndices));
                            }
                            break;
                        }
                        case 0x0205 when len >= 8: // BOOLERR
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            byte val = workbookBytes[dataStart + 6];
                            byte isErr = workbookBytes[dataStart + 7];
                            if (isErr == 0)
                            {
                                SetGridCell(rowDict, r, c, val != 0 ? "true" : "false");
                            }
                            break;
                        }
                        case 0x0006 when len >= 20: // FORMULA
                        {
                            int r = BitConverter.ToUInt16(workbookBytes, dataStart);
                            int c = BitConverter.ToUInt16(workbookBytes, dataStart + 2);
                            int xf = BitConverter.ToUInt16(workbookBytes, dataStart + 4);
                            if (workbookBytes[dataStart + 12] == 0xFF && workbookBytes[dataStart + 13] == 0xFF)
                            {
                                byte specialType = workbookBytes[dataStart + 6];
                                if (specialType == 0)
                                {
                                    pendingFormulaStringCell = (r, c);
                                }
                                else if (specialType == 1)
                                {
                                    SetGridCell(rowDict, r, c, workbookBytes[dataStart + 8] != 0 ? "true" : "false");
                                }
                            }
                            else
                            {
                                double num = BitConverter.ToDouble(workbookBytes, dataStart + 6);
                                SetGridCell(rowDict, r, c, FormatBiffNumber(num, xf, dateXfIndices));
                            }
                            break;
                        }
                    }
                }
            }

            pos = dataStart + len;
        }

        var grid = rowDict.Values.Where(r => r.Count > 0).ToList();
        return BuildResultFromSparseGrid(sheetNames, chosen.Name, grid);
    }

    private static void SetGridCell(SortedDictionary<int, Dictionary<int, string>> rowDict, int row, int col, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!rowDict.TryGetValue(row, out var cols))
        {
            cols = new Dictionary<int, string>();
            rowDict[row] = cols;
        }
        cols[col] = value.Trim();
    }

    private static string FormatBiffNumber(double num, int xfIndex, HashSet<int> dateXfIndices)
    {
        if (dateXfIndices.Contains(xfIndex) && num >= 1 && num < 2958466)
        {
            return FormatExcelSerialDate(num);
        }
        return num.ToString("G15", CultureInfo.InvariantCulture);
    }

    private static double DecodeRk(uint rk)
    {
        double val;
        if ((rk & 0x02) != 0)
        {
            int intVal = unchecked((int)rk) >> 2;
            val = intVal;
        }
        else
        {
            ulong rawBits = (ulong)(rk & 0xFFFFFFFC) << 32;
            val = BitConverter.Int64BitsToDouble(unchecked((long)rawBits));
        }

        if ((rk & 0x01) != 0)
        {
            val /= 100.0;
        }
        return val;
    }

    private static string ReadBiff8ShortString(byte[] data, int offset, int maxLen, int codepage)
    {
        if (maxLen < 2 || offset + 2 > data.Length) return string.Empty;
        int cch = data[offset];
        byte grbit = data[offset + 1];
        bool isUtf16 = (grbit & 0x01) != 0;
        int charStart = offset + 2;
        int byteLen = isUtf16 ? cch * 2 : cch;
        if (charStart + byteLen > data.Length) byteLen = Math.Max(0, data.Length - charStart);
        var enc = isUtf16 ? Encoding.Unicode : GetCodepageEncoding(codepage);
        return enc.GetString(data, charStart, byteLen);
    }

    private static string ReadBiff8LongString(byte[] data, int offset, int maxLen, int codepage)
    {
        if (maxLen < 3 || offset + 3 > data.Length) return string.Empty;
        int cch = BitConverter.ToUInt16(data, offset);
        byte grbit = data[offset + 2];
        bool isUtf16 = (grbit & 0x01) != 0;
        int charStart = offset + 3;
        if ((grbit & 0x08) != 0) charStart += 2; // cRun
        if ((grbit & 0x04) != 0) charStart += 4; // cbExtRst
        int byteLen = isUtf16 ? cch * 2 : cch;
        if (charStart >= data.Length) return string.Empty;
        if (charStart + byteLen > data.Length) byteLen = Math.Max(0, data.Length - charStart);
        var enc = isUtf16 ? Encoding.Unicode : GetCodepageEncoding(codepage);
        return enc.GetString(data, charStart, byteLen);
    }

    private static Encoding GetCodepageEncoding(int codepage)
    {
        try
        {
            return Encoding.GetEncoding(codepage == 0 ? 1252 : codepage);
        }
        catch
        {
            return Encoding.GetEncoding(1252);
        }
    }

    private static List<string> ParseBiff8Sst(byte[] data, List<(int Start, int Length)> chunks, int codepage)
    {
        var result = new List<string>();
        if (chunks.Count == 0) return result;

        var reader = new BiffChunkedReader(data, chunks);
        if (!reader.TryReadInt32(out _) || !reader.TryReadInt32(out int uniqueCount))
            return result;

        for (int i = 0; i < uniqueCount; i++)
        {
            if (!reader.TryReadUInt16(out ushort cch) || !reader.TryReadByte(out byte flags))
                break;

            bool isUtf16 = (flags & 0x01) != 0;
            bool hasExt = (flags & 0x04) != 0;
            bool hasRich = (flags & 0x08) != 0;

            ushort cRun = 0;
            int cbExt = 0;
            if (hasRich && !reader.TryReadUInt16(out cRun)) break;
            if (hasExt && !reader.TryReadInt32(out cbExt)) break;

            var sb = new StringBuilder(cch);
            int remainingChars = cch;
            while (remainingChars > 0)
            {
                if (reader.BytesLeftInCurrentChunk == 0)
                {
                    if (!reader.AdvanceChunk()) break;
                    if (!reader.TryReadByte(out byte contFlags)) break;
                    isUtf16 = (contFlags & 0x01) != 0;
                }

                int bytesPerChar = isUtf16 ? 2 : 1;
                int availChars = reader.BytesLeftInCurrentChunk / bytesPerChar;
                if (availChars <= 0)
                {
                    // Edge case: odd byte left before CONTINUE
                    if (!reader.AdvanceChunk()) break;
                    if (!reader.TryReadByte(out byte contFlags)) break;
                    isUtf16 = (contFlags & 0x01) != 0;
                    continue;
                }

                int takeChars = Math.Min(remainingChars, availChars);
                var slice = reader.ReadBytesRaw(takeChars * bytesPerChar);
                var enc = isUtf16 ? Encoding.Unicode : GetCodepageEncoding(codepage);
                sb.Append(enc.GetString(slice));
                remainingChars -= takeChars;
            }

            result.Add(sb.ToString());

            int extraBytes = (cRun * 4) + cbExt;
            if (extraBytes > 0)
            {
                reader.SkipBytes(extraBytes);
            }
        }

        return result;
    }

    private sealed class BiffChunkedReader
    {
        private readonly byte[] _data;
        private readonly List<(int Start, int Length)> _chunks;
        private int _chunkIdx;
        private int _offsetInChunk;

        public BiffChunkedReader(byte[] data, List<(int Start, int Length)> chunks)
        {
            _data = data;
            _chunks = chunks;
        }

        public int BytesLeftInCurrentChunk => _chunkIdx < _chunks.Count ? _chunks[_chunkIdx].Length - _offsetInChunk : 0;

        public bool AdvanceChunk()
        {
            _chunkIdx++;
            _offsetInChunk = 0;
            return _chunkIdx < _chunks.Count;
        }

        public bool TryReadByte(out byte b)
        {
            while (BytesLeftInCurrentChunk == 0)
            {
                if (!AdvanceChunk())
                {
                    b = 0;
                    return false;
                }
            }
            b = _data[_chunks[_chunkIdx].Start + _offsetInChunk];
            _offsetInChunk++;
            return true;
        }

        public bool TryReadUInt16(out ushort value)
        {
            var bytes = ReadBytesRaw(2);
            if (bytes.Length < 2)
            {
                value = 0;
                return false;
            }
            value = BitConverter.ToUInt16(bytes, 0);
            return true;
        }

        public bool TryReadInt32(out int value)
        {
            var bytes = ReadBytesRaw(4);
            if (bytes.Length < 4)
            {
                value = 0;
                return false;
            }
            value = BitConverter.ToInt32(bytes, 0);
            return true;
        }

        public byte[] ReadBytesRaw(int count)
        {
            var buf = new byte[count];
            int copied = 0;
            while (copied < count)
            {
                while (BytesLeftInCurrentChunk == 0)
                {
                    if (!AdvanceChunk())
                    {
                        Array.Resize(ref buf, copied);
                        return buf;
                    }
                }
                int take = Math.Min(count - copied, BytesLeftInCurrentChunk);
                Buffer.BlockCopy(_data, _chunks[_chunkIdx].Start + _offsetInChunk, buf, copied, take);
                _offsetInChunk += take;
                copied += take;
            }
            return buf;
        }

        public void SkipBytes(int count)
        {
            int left = count;
            while (left > 0)
            {
                while (BytesLeftInCurrentChunk == 0)
                {
                    if (!AdvanceChunk()) return;
                }
                int take = Math.Min(left, BytesLeftInCurrentChunk);
                _offsetInChunk += take;
                left -= take;
            }
        }
    }

    private static byte[] ExtractOle2WorkbookStream(byte[] fileBytes)
    {
        if (fileBytes.Length < 512)
            throw new InvalidOperationException("فایل .xls نامعتبر یا ناقص است.");

        int sectorShift = BitConverter.ToUInt16(fileBytes, 0x1E);
        int miniSectorShift = BitConverter.ToUInt16(fileBytes, 0x20);
        int sectorSize = 1 << sectorShift;
        int miniSectorSize = 1 << miniSectorShift;
        int numFatSectors = BitConverter.ToInt32(fileBytes, 0x2C);
        int firstDirSector = BitConverter.ToInt32(fileBytes, 0x30);
        uint miniStreamCutoff = BitConverter.ToUInt32(fileBytes, 0x38);
        int firstMiniFatSector = BitConverter.ToInt32(fileBytes, 0x3C);
        int firstDifatSector = BitConverter.ToInt32(fileBytes, 0x44);

        // 1. Collect FAT sector numbers from DIFAT (first 109 in header + DIFAT sectors)
        var fatSectorIds = new List<int>();
        for (int i = 0; i < 109 && fatSectorIds.Count < numFatSectors; i++)
        {
            int sid = BitConverter.ToInt32(fileBytes, 0x4C + (i * 4));
            if (sid >= 0) fatSectorIds.Add(sid);
        }

        int difatSec = firstDifatSector;
        var visitedDifat = new HashSet<int>();
        while (difatSec >= 0 && fatSectorIds.Count < numFatSectors && visitedDifat.Add(difatSec))
        {
            int secOffset = (difatSec + 1) * sectorSize;
            if (secOffset + sectorSize > fileBytes.Length) break;
            int entriesInSector = (sectorSize / 4) - 1;
            for (int i = 0; i < entriesInSector && fatSectorIds.Count < numFatSectors; i++)
            {
                int sid = BitConverter.ToInt32(fileBytes, secOffset + (i * 4));
                if (sid >= 0) fatSectorIds.Add(sid);
            }
            difatSec = BitConverter.ToInt32(fileBytes, secOffset + (entriesInSector * 4));
        }

        // 2. Build FAT table
        var fat = new List<int>();
        foreach (int fSid in fatSectorIds)
        {
            int secOffset = (fSid + 1) * sectorSize;
            if (secOffset + sectorSize > fileBytes.Length) break;
            for (int i = 0; i < sectorSize; i += 4)
            {
                fat.Add(BitConverter.ToInt32(fileBytes, secOffset + i));
            }
        }

        // 3. Read Directory stream
        var dirBytes = ReadFatChain(fileBytes, fat, firstDirSector, sectorSize, null);
        int rootStartSector = -2;
        uint rootSize = 0;
        int wbStartSector = -2;
        uint wbSize = 0;

        for (int entryOffset = 0; entryOffset + 128 <= dirBytes.Length; entryOffset += 128)
        {
            ushort nameBytesLen = BitConverter.ToUInt16(dirBytes, entryOffset + 0x40);
            byte objType = dirBytes[entryOffset + 0x42];
            int startSec = BitConverter.ToInt32(dirBytes, entryOffset + 0x74);
            uint streamSize = BitConverter.ToUInt32(dirBytes, entryOffset + 0x78);

            if (objType == 5) // Root Entry
            {
                rootStartSector = startSec;
                rootSize = streamSize;
                continue;
            }

            if (objType == 2 && nameBytesLen >= 2 && nameBytesLen <= 64)
            {
                string name = Encoding.Unicode.GetString(dirBytes, entryOffset, nameBytesLen - 2);
                if (name.Equals("Workbook", StringComparison.OrdinalIgnoreCase) ||
                    name.Equals("Book", StringComparison.OrdinalIgnoreCase))
                {
                    wbStartSector = startSec;
                    wbSize = streamSize;
                    break;
                }
            }
        }

        if (wbStartSector < 0 || wbSize == 0)
        {
            throw new InvalidOperationException("جریان داده Workbook در فایل .xls یافت نشد.");
        }

        if (wbSize >= miniStreamCutoff)
        {
            return ReadFatChain(fileBytes, fat, wbStartSector, sectorSize, wbSize);
        }

        // Read from MiniStream using MiniFAT
        var miniStream = ReadFatChain(fileBytes, fat, rootStartSector, sectorSize, rootSize);
        var miniFatBytes = ReadFatChain(fileBytes, fat, firstMiniFatSector, sectorSize, null);
        var miniFat = new List<int>();
        for (int i = 0; i + 4 <= miniFatBytes.Length; i += 4)
        {
            miniFat.Add(BitConverter.ToInt32(miniFatBytes, i));
        }

        var outMs = new MemoryStream((int)wbSize);
        int curMini = wbStartSector;
        var visitedMini = new HashSet<int>();
        long remaining = wbSize;
        while (curMini >= 0 && curMini < miniFat.Count && remaining > 0 && visitedMini.Add(curMini))
        {
            int miniOffset = curMini * miniSectorSize;
            if (miniOffset >= miniStream.Length) break;
            int copyLen = (int)Math.Min(Math.Min(miniSectorSize, remaining), miniStream.Length - miniOffset);
            outMs.Write(miniStream, miniOffset, copyLen);
            remaining -= copyLen;
            curMini = miniFat[curMini];
        }
        return outMs.ToArray();
    }

    private static byte[] ReadFatChain(byte[] fileBytes, List<int> fat, int startSector, int sectorSize, uint? maxLen)
    {
        var ms = new MemoryStream();
        int cur = startSector;
        var visited = new HashSet<int>();
        long remaining = maxLen ?? long.MaxValue;

        while (cur >= 0 && cur < fat.Count && remaining > 0 && visited.Add(cur))
        {
            int secOffset = (cur + 1) * sectorSize;
            if (secOffset >= fileBytes.Length) break;
            int copyLen = (int)Math.Min(Math.Min(sectorSize, remaining), fileBytes.Length - secOffset);
            ms.Write(fileBytes, secOffset, copyLen);
            remaining -= copyLen;
            cur = fat[cur];
        }
        return ms.ToArray();
    }

    #endregion

    #region Shared Grid Assembly

    private static ParsedTabularSheet BuildResultFromSparseGrid(
        List<string> sheetNames,
        string selectedSheetName,
        List<Dictionary<int, string>> grid)
    {
        var result = new ParsedTabularSheet
        {
            SheetNames = sheetNames,
            SelectedSheetName = selectedSheetName
        };

        if (grid.Count == 0) return result;

        var headerRow = grid[0];
        var orderedColIndices = headerRow.Keys.OrderBy(k => k).ToList();
        if (orderedColIndices.Count == 0) return result;

        var rawHeaderNames = orderedColIndices.Select(c => headerRow[c]).ToList();
        var cleanHeaders = DisambiguateHeaders(rawHeaderNames);
        var colIndexToHeader = new Dictionary<int, string>();
        for (int i = 0; i < orderedColIndices.Count; i++)
        {
            colIndexToHeader[orderedColIndices[i]] = cleanHeaders[i];
        }

        result.Headers = cleanHeaders;

        for (int rIdx = 1; rIdx < grid.Count; rIdx++)
        {
            var srcRow = grid[rIdx];
            var rowDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            bool hasAnyValue = false;

            foreach (var kv in colIndexToHeader)
            {
                if (srcRow.TryGetValue(kv.Key, out var val) && !string.IsNullOrWhiteSpace(val))
                {
                    rowDict[kv.Value] = val;
                    hasAnyValue = true;
                }
                else
                {
                    rowDict[kv.Value] = null;
                }
            }

            if (hasAnyValue)
            {
                result.Rows.Add(rowDict);
            }
        }

        return result;
    }

    private static List<string> DisambiguateHeaders(List<string> rawHeaders)
    {
        var clean = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < rawHeaders.Count; i++)
        {
            var baseName = (rawHeaders[i] ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(baseName))
            {
                baseName = $"ستون_{i + 1}";
            }

            var candidate = baseName;
            int suffix = 2;
            while (!seen.Add(candidate))
            {
                candidate = $"{baseName} ({suffix++})";
            }
            clean.Add(candidate);
        }

        return clean;
    }

    #endregion
}
