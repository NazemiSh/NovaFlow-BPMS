import React, { useState, useMemo, useEffect } from 'react';
import {
  Table as TableIcon,
  Layers,
  FileSpreadsheet,
  Database,
  Play,
  Plus,
  Trash2,
  X,
  Filter,
  Search,
  Calendar,
  Clock,
  Globe,
  Check,
  Eye,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  RotateCcw
} from 'lucide-react';
import api from '../api';
import { useDialog } from './GlobalDialogProvider';
import {
  ExcelFileUploadBox,
  ExcelKeyValidationBanner,
  ExcelLivePreviewTable,
  ExcelSheetSelector,
  pickBestUniqueKeyColumn
} from './MasterDataExcelShared';

export default function MasterDataTableModal({
  isOpen,
  onClose,
  editingTable,
  tableForm,
  setTableForm,
  connections,
  sqlPreviewLoading,
  sqlPreviewResult,
  sqlPreviewError,
  handlePreviewSql,
  handleAddColumn,
  handleRemoveColumn,
  handleColumnChange,
  handleSaveTable,
  savingTable = false
}) {
  const { toast } = useDialog();

  // -------------------------------------------------------------
  // Excel / CSV Live Preview & Column Selection State
  // -------------------------------------------------------------
  const [excelFile, setExcelFile] = useState(null);
  const [excelPreview, setExcelPreview] = useState(null);
  const [excelSheetName, setExcelSheetName] = useState('');
  const [excelPreviewLoading, setExcelPreviewLoading] = useState(false);
  const [excelPreviewError, setExcelPreviewError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setExcelFile(null);
      setExcelPreview(null);
      setExcelSheetName('');
      setExcelPreviewLoading(false);
      setExcelPreviewError('');
    }
  }, [isOpen]);

  const fetchExcelPreview = async (file, requestedSheet = null) => {
    if (!file) return;
    setExcelPreviewLoading(true);
    setExcelPreviewError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (requestedSheet) {
        formData.append('sheetName', requestedSheet);
      }

      const res = await api.post('/masterdata/excel/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const data = res.data;
      setExcelPreview(data);
      setExcelSheetName(data.selectedSheetName || '');

      const extractedCols = (data.columns || []).map((c) => ({
        name: c.suggestedName,
        title: c.suggestedTitle,
        dataType: c.suggestedDataType || 'string',
        sourceHeader: c.sourceHeader,
        included: true
      }));

      if (extractedCols.length > 0) {
        const bestKey = pickBestUniqueKeyColumn(extractedCols);
        setTableForm((prev) => ({
          ...prev,
          columns: extractedCols,
          uniqueKeyColumn: bestKey
        }));
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'خطا در تحلیل فایل اکسل یا CSV';
      setExcelPreviewError(msg);
      if (!requestedSheet) {
        setExcelPreview(null);
      }
    } finally {
      setExcelPreviewLoading(false);
    }
  };

  const handleSelectExcelFile = (file) => {
    setExcelFile(file);
    fetchExcelPreview(file, null);
  };

  const handleClearExcelFile = () => {
    setExcelFile(null);
    setExcelPreview(null);
    setExcelSheetName('');
    setExcelPreviewError('');
  };

  const handleChangeExcelSheet = (nextSheet) => {
    setExcelSheetName(nextSheet);
    if (excelFile) {
      fetchExcelPreview(excelFile, nextSheet);
    }
  };

  const isExcelPreviewActive = tableForm.sourceType === 'Excel' && Boolean(excelPreview);

  const handleToggleExcelColumn = (idx) => {
    setTableForm((prev) => {
      const nextCols = prev.columns.map((c, i) =>
        i === idx ? { ...c, included: c.included === false } : c
      );
      const checkedCols = nextCols.filter((c) => c.included !== false);
      let nextKey = prev.uniqueKeyColumn;
      if (!checkedCols.some((c) => c.name === nextKey)) {
        nextKey = pickBestUniqueKeyColumn(nextCols);
      }
      return {
        ...prev,
        columns: nextCols,
        uniqueKeyColumn: nextKey
      };
    });
  };

  const handleToggleAllExcelColumns = () => {
    setTableForm((prev) => {
      const allSelected = prev.columns.every((c) => c.included !== false);
      const nextCols = prev.columns.map((c) => ({ ...c, included: !allSelected }));
      const nextKey = !allSelected ? pickBestUniqueKeyColumn(nextCols) : '';
      return {
        ...prev,
        columns: nextCols,
        uniqueKeyColumn: nextKey
      };
    });
  };

  const checkedColumns = useMemo(() => {
    if (isExcelPreviewActive) {
      return (tableForm.columns || []).filter((c) => c.included !== false);
    }
    return tableForm.columns || [];
  }, [isExcelPreviewActive, tableForm.columns]);

  const activeKeyColumnObj = useMemo(() => {
    return (
      checkedColumns.find((c) => c.name === tableForm.uniqueKeyColumn) ||
      checkedColumns[0] ||
      null
    );
  }, [checkedColumns, tableForm.uniqueKeyColumn]);

  const activeExcelKeyStats = useMemo(() => {
    if (!isExcelPreviewActive || !activeKeyColumnObj) return null;
    const headerKey = activeKeyColumnObj.sourceHeader || activeKeyColumnObj.name;
    return excelPreview?.columnStats?.[headerKey] || null;
  }, [isExcelPreviewActive, activeKeyColumnObj, excelPreview]);

  const handleFormSubmit = (e) => {
    e.preventDefault();

    if (tableForm.sourceType === 'Excel') {
      if (!editingTable && !excelFile) {
        toast.warning('لطفاً فایل اکسل یا CSV را انتخاب نمایید.');
        return;
      }

      if (excelFile && excelPreview) {
        if (checkedColumns.length === 0) {
          toast.warning('حداقل یک ستون باید برای ورود به جدول مرجع تیک خورده باشد.');
          return;
        }

        const seenNames = new Set();
        for (const col of checkedColumns) {
          const cleanName = (col.name || '').trim();
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleanName)) {
            toast.warning(`کد انگلیسی ستون «${col.title || cleanName || 'بدون نام'}» باید با حروف لاتین یا _ شروع شود و فقط شامل حروف انگلیسی، عدد و _ باشد.`);
            return;
          }
          const lower = cleanName.toLowerCase();
          if (seenNames.has(lower)) {
            toast.warning(`کد انگلیسی ستون «${cleanName}» تکراری است. لطفاً کد یکتایی وارد نمایید.`);
            return;
          }
          seenNames.add(lower);
        }

        if (!tableForm.uniqueKeyColumn || !checkedColumns.some((c) => c.name === tableForm.uniqueKeyColumn)) {
          toast.warning('لطفاً ستون کلید یکتا را از میان ستون‌های انتخاب‌شده تعیین نمایید.');
          return;
        }

        if ((excelPreview.totalRows || 0) === 0) {
          toast.warning('شیت انتخاب‌شده فاقد ردیف داده است.');
          return;
        }

        if (activeExcelKeyStats && activeExcelKeyStats.emptyCount >= excelPreview.totalRows) {
          toast.error('تمام ردیف‌های ستون کلید یکتا خالی هستند. لطفاً ستون کلید یکتای دیگری انتخاب نمایید.');
          return;
        }
      }

      handleSaveTable(e, {
        excelFile,
        sheetName: excelSheetName,
        columnsToSave: checkedColumns
      });
      return;
    }

    handleSaveTable(e);
  };

  // -------------------------------------------------------------
  // Full Preview & Filter Modal State (Section 3)
  // -------------------------------------------------------------
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  const [fullPreviewLoading, setFullPreviewLoading] = useState(false);
  const [fullPreviewData, setFullPreviewData] = useState(null);
  const [fullPreviewError, setFullPreviewError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRules, setFilterRules] = useState([]);
  const [newRuleCol, setNewRuleCol] = useState('');
  const [newRuleOp, setNewRuleOp] = useState('contains');
  const [newRuleVal, setNewRuleVal] = useState('');
  const [excludedKeys, setExcludedKeys] = useState(new Set());
  const [previewPage, setPreviewPage] = useState(1);
  const pageSize = 50;

  // Initialize filter rules & excluded keys from tableForm when opened
  useEffect(() => {
    if (tableForm.filterRulesJson) {
      try {
        const parsed = JSON.parse(tableForm.filterRulesJson);
        if (Array.isArray(parsed)) setFilterRules(parsed);
      } catch (e) {
        setFilterRules([]);
      }
    } else {
      setFilterRules([]);
    }

    if (tableForm.excludedKeysJson) {
      try {
        const parsed = JSON.parse(tableForm.excludedKeysJson);
        if (Array.isArray(parsed)) setExcludedKeys(new Set(parsed));
      } catch (e) {
        setExcludedKeys(new Set());
      }
    } else {
      setExcludedKeys(new Set());
    }
  }, [tableForm.filterRulesJson, tableForm.excludedKeysJson, isOpen]);

  const handleOpenFullPreview = async () => {
    if (!tableForm.connectionId) {
      toast.warning('لطفاً ابتدا اتصال پایگاه‌داده را انتخاب نمایید.');
      return;
    }
    if (!tableForm.sqlQuery || !tableForm.sqlQuery.trim()) {
      toast.warning('لطفاً متن کوئری SQL را وارد نمایید.');
      return;
    }

    setFullPreviewError('');
    setFullPreviewLoading(true);
    setFullPreviewOpen(true);
    setPreviewPage(1);

    try {
      const res = await api.post('/masterdata/connections/preview-full', {
        connectionId: parseInt(tableForm.connectionId),
        sqlQuery: tableForm.sqlQuery.trim(),
        maxRows: 20000
      });

      setFullPreviewData(res.data);

      // Auto set newRuleCol default
      if (res.data.columns && res.data.columns.length > 0) {
        setNewRuleCol(res.data.columns[0].name);
      }

      // If columns list in tableForm is empty or default, suggest populating
      if (!tableForm.columns || tableForm.columns.length <= 1) {
        setTableForm(prev => ({
          ...prev,
          columns: res.data.columns.map(c => ({
            name: c.name,
            title: c.title || c.name,
            dataType: c.dataType || 'string'
          }))
        }));
      }
    } catch (err) {
      setFullPreviewError(err.response?.data?.message || err.message || 'خطا در واکشی کل اطلاعات کوئری');
    } finally {
      setFullPreviewLoading(false);
    }
  };

  const handleAddFilterRule = () => {
    if (!newRuleCol) return;
    if (newRuleOp !== 'is_not_empty' && (!newRuleVal || !newRuleVal.trim())) {
      toast.warning('لطفاً مقدار شرط را وارد کنید.');
      return;
    }

    const nextRules = [
      ...filterRules,
      { column: newRuleCol, operator: newRuleOp, value: newRuleVal.trim() }
    ];
    setFilterRules(nextRules);
    setNewRuleVal('');
    setPreviewPage(1);
  };

  const handleRemoveFilterRule = (idx) => {
    const next = filterRules.filter((_, i) => i !== idx);
    setFilterRules(next);
    setPreviewPage(1);
  };

  const toggleExcludeKey = (keyVal) => {
    if (!keyVal) return;
    const next = new Set(excludedKeys);
    if (next.has(keyVal)) {
      next.delete(keyVal);
    } else {
      next.add(keyVal);
    }
    setExcludedKeys(next);
  };

  // Filtered rows in client
  const filteredRows = useMemo(() => {
    if (!fullPreviewData || !fullPreviewData.rows) return [];
    let rows = fullPreviewData.rows;

    // 1. Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(r => {
        return Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q));
      });
    }

    // 2. Column filter rules
    if (filterRules.length > 0) {
      rows = rows.filter(row => {
        return filterRules.every(rule => {
          const rawVal = row[rule.column];
          const valStr = rawVal !== null && rawVal !== undefined ? String(rawVal).trim().toLowerCase() : '';
          const targetStr = (rule.value || '').trim().toLowerCase();

          switch (rule.operator) {
            case 'equals':
              return valStr === targetStr;
            case 'not_equals':
              return valStr !== targetStr;
            case 'contains':
              return valStr.includes(targetStr);
            case 'not_contains':
              return !valStr.includes(targetStr);
            case 'starts_with':
              return valStr.startsWith(targetStr);
            case 'gt':
              return parseFloat(valStr) > parseFloat(targetStr);
            case 'lt':
              return parseFloat(valStr) < parseFloat(targetStr);
            case 'is_not_empty':
              return valStr !== '';
            default:
              return true;
          }
        });
      });
    }

    return rows;
  }, [fullPreviewData, searchQuery, filterRules]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = (previewPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, previewPage]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const handleApplyFiltersToTable = () => {
    const rulesJson = filterRules.length > 0 ? JSON.stringify(filterRules) : null;
    const excludedJson = excludedKeys.size > 0 ? JSON.stringify(Array.from(excludedKeys)) : null;

    setTableForm(prev => ({
      ...prev,
      filterRulesJson: rulesJson,
      excludedKeysJson: excludedJson
    }));
    setFullPreviewOpen(false);
  };

  // -------------------------------------------------------------
  // Advanced PBI-Style Scheduler State (Section 4)
  // -------------------------------------------------------------
  const [scheduleConfig, setScheduleConfig] = useState(() => {
    if (tableForm.scheduleConfigJson) {
      try {
        return JSON.parse(tableForm.scheduleConfigJson);
      } catch (e) {}
    }
    // Fallback from legacy
    if (tableForm.syncScheduleType === 'IntervalMinutes') {
      const mins = parseInt(tableForm.syncScheduleValue) || 60;
      return {
        frequency: 'Hour',
        intervalHours: Math.floor(mins / 60),
        intervalMinutes: mins % 60,
        hour: 2,
        minute: 0,
        intervalDays: 1,
        workdaysOnly: false,
        daysOfWeek: ['Saturday'],
        daysOfMonth: [1],
        lastDayOfMonth: false,
        runDate: '',
        startDate: '',
        endDate: ''
      };
    }
    if (tableForm.syncScheduleType === 'DailyTime' && tableForm.syncScheduleValue) {
      const parts = tableForm.syncScheduleValue.split(':');
      return {
        frequency: 'Day',
        intervalHours: 1,
        intervalMinutes: 0,
        hour: parseInt(parts[0]) || 2,
        minute: parseInt(parts[1]) || 0,
        intervalDays: 1,
        workdaysOnly: false,
        daysOfWeek: ['Saturday'],
        daysOfMonth: [1],
        lastDayOfMonth: false,
        runDate: '',
        startDate: '',
        endDate: ''
      };
    }
    return {
      frequency: 'None',
      intervalHours: 1,
      intervalMinutes: 0,
      hour: 2,
      minute: 30,
      intervalDays: 1,
      workdaysOnly: false,
      daysOfWeek: ['Saturday', 'Monday', 'Wednesday'],
      daysOfMonth: [1, 15],
      lastDayOfMonth: false,
      runDate: '',
      startDate: '',
      endDate: ''
    };
  });

  const updateSchedule = (updates) => {
    const next = { ...scheduleConfig, ...updates };
    setScheduleConfig(next);

    // Synchronize to tableForm
    const jsonStr = next.frequency !== 'None' ? JSON.stringify(next) : null;
    let legacyType = 'None';
    let legacyVal = '';

    if (next.frequency === 'Hour') {
      legacyType = 'IntervalMinutes';
      legacyVal = String((next.intervalHours * 60) + next.intervalMinutes);
    } else if (next.frequency === 'Day') {
      legacyType = 'DailyTime';
      legacyVal = `${String(next.hour).padStart(2, '0')}:${String(next.minute).padStart(2, '0')}`;
    }

    setTableForm(prev => ({
      ...prev,
      scheduleConfigJson: jsonStr,
      syncScheduleType: legacyType,
      syncScheduleValue: legacyVal
    }));
  };

  const daysOfWeekOptions = [
    { id: 'Saturday', title: 'شنبه' },
    { id: 'Sunday', title: 'یکشنبه' },
    { id: 'Monday', title: 'دوشنبه' },
    { id: 'Tuesday', title: 'سه‌شنبه' },
    { id: 'Wednesday', title: 'چهارشنبه' },
    { id: 'Thursday', title: 'پنج‌شنبه' },
    { id: 'Friday', title: 'جمعه' }
  ];

  const toggleDayOfWeek = (dayId) => {
    const cur = scheduleConfig.daysOfWeek || [];
    const next = cur.includes(dayId) ? cur.filter(d => d !== dayId) : [...cur, dayId];
    updateSchedule({ daysOfWeek: next });
  };

  // Compute live next run string (in Persian display)
  const nextRunPreviewText = useMemo(() => {
    if (scheduleConfig.frequency === 'None') return 'غیرفعال (فقط اجرای دستی توسط کاربر)';
    const timeStr = `ساعت ${String(scheduleConfig.hour).padStart(2, '0')}:${String(scheduleConfig.minute).padStart(2, '0')}`;

    switch (scheduleConfig.frequency) {
      case 'Once':
        return `یکبار اجرا در تاریخ ${scheduleConfig.runDate || 'تعیین نشده'} در ${timeStr}`;
      case 'Hour':
        return `هر ${scheduleConfig.intervalHours} ساعت و ${scheduleConfig.intervalMinutes} دقیقه (شروع از ${timeStr})`;
      case 'Day':
        return scheduleConfig.workdaysOnly
          ? `هر روز کاری (شنبه تا چهارشنبه) در ${timeStr}`
          : `هر ${scheduleConfig.intervalDays} روز در ${timeStr}`;
      case 'Week': {
        const faDays = (scheduleConfig.daysOfWeek || []).map(d => daysOfWeekOptions.find(o => o.id === d)?.title || d).join('، ');
        return `هر ${scheduleConfig.intervalWeeks || 1} هفته در روزهای (${faDays || 'انتخاب نشده'}) در ${timeStr}`;
      }
      case 'Month': {
        const days = (scheduleConfig.daysOfMonth || []).join('، ');
        const last = scheduleConfig.lastDayOfMonth ? ' + آخرین روز ماه' : '';
        return `ماهانه در روزهای [${days}${last}] در ${timeStr}`;
      }
      default:
        return 'تنظیم نشده';
    }
  }, [scheduleConfig]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in">
        {/* هدر مودال اصلی */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#181926]">
          <div className="flex items-center gap-2.5">
            <TableIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              {editingTable ? `ویرایش تنظیمات جدول: ${editingTable.title}` : 'تعریف جدول مرجع جدید (Master Table)'}
            </h3>
          </div>
          <button
            type="button"
            disabled={savingTable}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* بخش ۱: اطلاعات پایه */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                کد یکتای جدول (انگلیسی) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={tableForm.code}
                onChange={(e) => setTableForm({ ...tableForm, code: e.target.value.toUpperCase() })}
                placeholder="مثال: CUSTOMERS یا PRODUCTS"
                className="w-full text-xs font-mono font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 text-left"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                عنوان فارسی جدول <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={tableForm.title}
                onChange={(e) => setTableForm({ ...tableForm, title: e.target.value })}
                placeholder="مثال: فهرست مشتریان و طرف‌حساب‌های سازمان"
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* بخش ۲: منبع تأمین داده */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              نوع منبع داده (Source Type)
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label
                className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${
                  tableForm.sourceType === 'Manual'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  checked={tableForm.sourceType === 'Manual'}
                  onChange={() => setTableForm({ ...tableForm, sourceType: 'Manual' })}
                  className="hidden"
                />
                <Layers className="w-4 h-4 text-blue-600" />
                <span className="text-xs">ثبت دستی در سامانه</span>
              </label>

              <label
                className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${
                  tableForm.sourceType === 'Excel'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  checked={tableForm.sourceType === 'Excel'}
                  onChange={() => setTableForm({ ...tableForm, sourceType: 'Excel' })}
                  className="hidden"
                />
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="text-xs">فایل اکسل / CSV</span>
              </label>

              <label
                className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition ${
                  tableForm.sourceType === 'SqlQuery'
                    ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-300 font-bold'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-600 dark:text-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  checked={tableForm.sourceType === 'SqlQuery'}
                  onChange={() => setTableForm({ ...tableForm, sourceType: 'SqlQuery' })}
                  className="hidden"
                />
                <Database className="w-4 h-4 text-cyan-600" />
                <span className="text-xs">کوئری SQL Server</span>
              </label>
            </div>
          </div>

          {/* در صورت انتخاب منبع فایل اکسل / CSV */}
          {tableForm.sourceType === 'Excel' && (
            <div className="bg-emerald-50/40 dark:bg-[#181926] p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-950/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>بارگذاری فایل اکسل / CSV جهت استخراج خودکار ساختار و پیش‌نمایش زنده</span>
                </span>
                {editingTable && !excelFile && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    انتخاب فایل جدید در این بخش اختیاری است (برای جایگزینی یا به‌روزرسانی داده‌ها).
                  </span>
                )}
              </div>

              <ExcelFileUploadBox
                file={excelFile}
                loading={excelPreviewLoading}
                error={excelPreviewError}
                onSelectFile={handleSelectExcelFile}
                onClearFile={handleClearExcelFile}
              />

              {excelPreview && (
                <ExcelSheetSelector
                  sheetNames={excelPreview.sheetNames}
                  selectedSheetName={excelSheetName}
                  onChangeSheet={handleChangeExcelSheet}
                  loading={excelPreviewLoading}
                />
              )}
            </div>
          )}

          {/* در صورت انتخاب کوئری SQL */}
          {tableForm.sourceType === 'SqlQuery' && (
            <div className="bg-cyan-50/40 dark:bg-[#181926] p-4 rounded-2xl border border-cyan-100 dark:border-cyan-950/60 space-y-3">
              <div>
                <label className="block text-xs font-bold text-cyan-950 dark:text-cyan-300 mb-1">
                  انتخاب اتصال پایگاه‌داده مقصد <span className="text-rose-500">*</span>
                </label>
                <select
                  value={tableForm.connectionId}
                  onChange={(e) => setTableForm({ ...tableForm, connectionId: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="">-- لطفاً یک اتصال SQL Server انتخاب نمایید --</option>
                  {connections.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.serverAddress} / {c.databaseName})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-cyan-950 dark:text-cyan-300">
                    متن کوئری SQL (فقط SELECT خواندنی) <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">دستورات تغییر داده یا DDL به دلایل امنیتی مسدود است</span>
                </div>
                <textarea
                  rows={4}
                  dir="ltr"
                  value={tableForm.sqlQuery}
                  onChange={(e) => setTableForm({ ...tableForm, sqlQuery: e.target.value })}
                  placeholder="SELECT ProductID, ProductCode, ProductName, Price, Unit FROM dbo.Products ORDER BY ProductID"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-cyan-200 dark:border-cyan-800 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none text-left"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={sqlPreviewLoading}
                    onClick={handlePreviewSql}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    <Play className={`w-3.5 h-3.5 ${sqlPreviewLoading ? 'animate-spin' : ''}`} />
                    <span>{sqlPreviewLoading ? 'در حال اجرای آزمایشی...' : 'اجرای آزمایشی و شناسایی ستون‌ها'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={fullPreviewLoading}
                    onClick={handleOpenFullPreview}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                  >
                    <Filter className="w-3.5 h-3.5" />
                    <span>بازبینی کامل داده‌ها و فیلتر</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500">
                  شناسایی ساختار ستون‌ها و اعمال فیلتر پیش از همگام‌سازی
                </span>
              </div>

              {/* اعلان وضعیت فیلترها در صورت وجود */}
              {(filterRules.length > 0 || excludedKeys.size > 0) && (
                <div className="p-2.5 rounded-xl bg-cyan-100/70 dark:bg-cyan-950/60 border border-cyan-300 dark:border-cyan-800 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-cyan-900 dark:text-cyan-200 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                    <span>
                      فیلترهای همگام‌سازی: {filterRules.length} شرط ستونی | {excludedKeys.size} رکورد مستثنی‌شده
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenFullPreview}
                    className="text-[11px] text-cyan-700 dark:text-cyan-300 hover:underline font-bold cursor-pointer"
                  >
                    ویرایش فیلترها
                  </button>
                </div>
              )}

              {sqlPreviewError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 dark:text-rose-300 text-xs">
                  {sqlPreviewError}
                </div>
              )}

              {/* پیش‌نمایش سطرهای نمونه */}
              {sqlPreviewResult && sqlPreviewResult.sampleRows?.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-cyan-900 dark:text-cyan-300 block">
                    نمونه ۱۰ سطر اول واکشی‌شده:
                  </span>
                  <div className="overflow-x-auto border border-cyan-200 dark:border-cyan-900 rounded-xl bg-white dark:bg-[#1e2030] max-h-48">
                    <table className="w-full text-[11px] text-right border-collapse">
                      <thead className="bg-cyan-100/70 dark:bg-cyan-950 text-cyan-900 dark:text-cyan-200 font-bold sticky top-0">
                        <tr>
                          {sqlPreviewResult.columns.map(c => (
                            <th key={c.name} className="p-2 border-b border-cyan-200 dark:border-cyan-900">{c.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sqlPreviewResult.sampleRows.map((r, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            {sqlPreviewResult.columns.map(c => (
                              <td key={c.name} className="p-2 text-slate-700 dark:text-slate-300 font-mono">
                                {String(r[c.name] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* بخش ۳: تعریف ستون‌های جدول مرجع */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                  ستون‌های جدول مرجع <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {isExcelPreviewActive
                    ? 'ستون‌های دلخواه را تیک بزنید و در صورت نیاز کد انگلیسی، عنوان فارسی و نوع داده هر ستون را ویرایش کنید.'
                    : 'این ستون‌ها در لیست انتخابی و نگاشت فیلدهای خودکار (Auto-fill) فرم‌ها در دسترس خواهند بود.'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isExcelPreviewActive ? (
                  <>
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {checkedColumns.length} از {tableForm.columns.length} ستون انتخاب شده
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleAllExcelColumns}
                      className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {tableForm.columns.every((c) => c.included !== false)
                          ? 'لغو انتخاب همه'
                          : 'انتخاب همه'}
                      </span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن ستون</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {tableForm.columns.map((col, idx) => {
                const isIncluded = !isExcelPreviewActive || col.included !== false;
                return (
                  <div
                    key={`${col.sourceHeader || 'col'}_${idx}`}
                    className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl border transition ${
                      isIncluded
                        ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926]'
                        : 'border-slate-200/60 dark:border-slate-800 bg-slate-100/60 dark:bg-[#151622] opacity-60'
                    }`}
                  >
                    {isExcelPreviewActive && (
                      <label
                        className="flex items-center gap-1.5 cursor-pointer shrink-0 pl-1"
                        title="وارد کردن این ستون"
                      >
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={() => handleToggleExcelColumn(idx)}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </label>
                    )}

                    <div className="w-8 text-center text-slate-400 text-xs font-mono shrink-0">#{idx + 1}</div>

                    <div className="flex-1 min-w-[140px]">
                      <input
                        type="text"
                        dir="ltr"
                        disabled={!isIncluded}
                        value={col.name}
                        onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                        placeholder="کد انگلیسی ستون"
                        className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-left disabled:opacity-60"
                      />
                    </div>

                    <div className="flex-1 min-w-[140px]">
                      <input
                        type="text"
                        disabled={!isIncluded}
                        value={col.title}
                        onChange={(e) => handleColumnChange(idx, 'title', e.target.value)}
                        placeholder="عنوان فارسی ستون"
                        className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 disabled:opacity-60"
                      />
                    </div>

                    <div className="w-28 shrink-0">
                      <select
                        disabled={!isIncluded}
                        value={col.dataType}
                        onChange={(e) => handleColumnChange(idx, 'dataType', e.target.value)}
                        className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 disabled:opacity-60"
                      >
                        <option value="string">متن (String)</option>
                        <option value="number">عدد (Number)</option>
                        <option value="date">تاریخ (Date)</option>
                      </select>
                    </div>

                    {isExcelPreviewActive ? (
                      <span
                        className="text-[10px] font-mono text-slate-400 px-2 py-1 rounded-lg bg-white dark:bg-[#1e2030] border border-slate-200/80 dark:border-slate-700/80 max-w-[120px] truncate shrink-0"
                        title={`سرستون فایل: ${col.sourceHeader || col.name}`}
                      >
                        {col.sourceHeader || col.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRemoveColumn(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                        title="حذف ستون"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* بخش ۴: انتخاب ستون کلید یکتا (Unique Key) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">
              ستون کلید یکتا (Unique Key) <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={tableForm.uniqueKeyColumn}
                disabled={checkedColumns.length === 0}
                onChange={(e) => setTableForm({ ...tableForm, uniqueKeyColumn: e.target.value })}
                className="max-w-xs text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 disabled:opacity-50"
              >
                {checkedColumns.length === 0 ? (
                  <option value="">-- ابتدا حداقل یک ستون را تیک بزنید --</option>
                ) : (
                  checkedColumns.map((c, idx) => (
                    <option key={`${c.name}_${idx}`} value={c.name}>
                      {c.title || c.name} ({c.name})
                    </option>
                  ))
                )}
              </select>
              <span className="text-[11px] text-slate-400">
                عملیات Upsert، کش محلی و اتصال به فرم‌ها بر اساس این ستون یکتا انجام می‌شود.
              </span>
            </div>
          </div>

          {/* پیش‌نمایش زنده داده‌های اکسل / CSV و اعتبارسنجی کلید یکتا */}
          {isExcelPreviewActive && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <ExcelKeyValidationBanner
                totalRows={excelPreview.totalRows || 0}
                keyColumnLabel={activeKeyColumnObj ? `${activeKeyColumnObj.title || activeKeyColumnObj.name} (${activeKeyColumnObj.name})` : ''}
                keyStats={activeExcelKeyStats}
                hasKeyMapping={Boolean(activeKeyColumnObj)}
              />

              <ExcelLivePreviewTable
                columns={checkedColumns}
                previewRows={excelPreview.previewRows || []}
                totalRows={excelPreview.totalRows || 0}
                uniqueKeyColumnName={tableForm.uniqueKeyColumn}
              />
            </div>
          )}

          {/* بخش ۵: زمانبند پیشرفته مشابه Power BI Report Server (Section 4) */}
          {tableForm.sourceType === 'SqlQuery' && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-600" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    زمانبندی همگام‌سازی خودکار در پس‌زمینه (Advanced PBI-Style Scheduler)
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] bg-slate-100 dark:bg-[#181926] text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Globe className="w-3.5 h-3.5 text-cyan-500" />
                  <span>منطقه زمانی: تهران (UTC +03:30)</span>
                </div>
              </div>

              {/* تب‌های انتخاب تکرار (Frequency) */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {[
                  { id: 'None', label: 'غیرفعال' },
                  { id: 'Once', label: 'یکبار اجرا' },
                  { id: 'Hour', label: 'ساعتی' },
                  { id: 'Day', label: 'روزانه' },
                  { id: 'Week', label: 'هفتگی' },
                  { id: 'Month', label: 'ماهانه' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => updateSchedule({ frequency: tab.id })}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      scheduleConfig.frequency === tab.id
                        ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-500/20'
                        : 'bg-slate-50 dark:bg-[#181926] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* جزئیات پیکربندی زمانبند بر اساس نوع انتخاب شده */}
              {scheduleConfig.frequency !== 'None' && (
                <div className="bg-slate-50 dark:bg-[#181926] p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                  {/* انتخابگر زمان اجرا (ساعت و دقیقه با ورودی عددی بدون باگ --:--) */}
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        ساعت اجرا (به وقت تهران):
                      </span>
                      <div className="flex items-center gap-1 bg-white dark:bg-[#1e2030] px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 font-mono text-sm font-bold">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={scheduleConfig.hour}
                          onChange={(e) => updateSchedule({ hour: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)) })}
                          className="w-10 text-center bg-transparent focus:outline-none"
                          title="ساعت (00 تا 23)"
                        />
                        <span className="text-slate-400">:</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          step="5"
                          value={scheduleConfig.minute}
                          onChange={(e) => updateSchedule({ minute: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) })}
                          className="w-10 text-center bg-transparent focus:outline-none"
                          title="دقیقه (00 تا 59)"
                        />
                      </div>
                    </div>

                    {/* دکمه‌های سریع برای ساعات پرتکرار */}
                    <div className="flex items-center gap-1">
                      {[
                        { label: '۰۲:۳۰ بامداد', h: 2, m: 30 },
                        { label: '۰۶:۰۰ صبح', h: 6, m: 0 },
                        { label: '۱۲:۰۰ ظهر', h: 12, m: 0 },
                        { label: '۲۰:۰۰ شب', h: 20, m: 0 }
                      ].map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => updateSchedule({ hour: preset.h, minute: preset.m })}
                          className="text-[10px] px-2 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* تنظیمات اختصاصی: Once */}
                  {scheduleConfig.frequency === 'Once' && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200">تاریخ اجرا:</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={scheduleConfig.runDate || ''}
                        onChange={(e) => updateSchedule({ runDate: e.target.value })}
                        placeholder="1405-01-01 یا 2026-03-21"
                        className="text-xs font-mono px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  )}

                  {/* تنظیمات اختصاصی: Hour */}
                  {scheduleConfig.frequency === 'Hour' && (
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200">تکرار هر:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="24"
                          value={scheduleConfig.intervalHours}
                          onChange={(e) => updateSchedule({ intervalHours: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-14 text-xs font-mono text-center px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030]"
                        />
                        <span className="text-xs text-slate-500">ساعت و</span>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          step="5"
                          value={scheduleConfig.intervalMinutes}
                          onChange={(e) => updateSchedule({ intervalMinutes: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-14 text-xs font-mono text-center px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030]"
                        />
                        <span className="text-xs text-slate-500">دقیقه</span>
                      </div>
                    </div>
                  )}

                  {/* تنظیمات اختصاصی: Day */}
                  {scheduleConfig.frequency === 'Day' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-xs">
                          <input
                            type="radio"
                            name="dayScheduleMode"
                            checked={!scheduleConfig.workdaysOnly}
                            onChange={() => updateSchedule({ workdaysOnly: false })}
                          />
                          <span>تکرار هر</span>
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={scheduleConfig.intervalDays}
                            onChange={(e) => updateSchedule({ intervalDays: Math.max(1, parseInt(e.target.value) || 1) })}
                            className="w-14 text-xs font-mono text-center px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030]"
                          />
                          <span>روز یکبار</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-cyan-700 dark:text-cyan-300">
                          <input
                            type="radio"
                            name="dayScheduleMode"
                            checked={scheduleConfig.workdaysOnly}
                            onChange={() => updateSchedule({ workdaysOnly: true })}
                          />
                          <span>فقط روزهای کاری (شنبه تا چهارشنبه)</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* تنظیمات اختصاصی: Week */}
                  {scheduleConfig.frequency === 'Week' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span>تکرار هر</span>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          value={scheduleConfig.intervalWeeks || 1}
                          onChange={(e) => updateSchedule({ intervalWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
                          className="w-14 text-xs font-mono text-center px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030]"
                        />
                        <span>هفته در روزهای:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {daysOfWeekOptions.map(day => {
                          const isSelected = (scheduleConfig.daysOfWeek || []).includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => toggleDayOfWeek(day.id)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-600 text-white border-cyan-600'
                                  : 'bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {day.title}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* تنظیمات اختصاصی: Month */}
                  {scheduleConfig.frequency === 'Month' && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                        روزهای ماه برای اجرا:
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {[1, 5, 10, 15, 20, 25].map(d => {
                          const isSel = (scheduleConfig.daysOfMonth || []).includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                const cur = scheduleConfig.daysOfMonth || [];
                                const next = isSel ? cur.filter(x => x !== d) : [...cur, d];
                                updateSchedule({ daysOfMonth: next });
                              }}
                              className={`w-9 h-9 rounded-xl text-xs font-mono font-bold transition border cursor-pointer ${
                                isSel
                                  ? 'bg-cyan-600 text-white border-cyan-600'
                                  : 'bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {d}
                            </button>
                          );
                        })}

                        <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer bg-white dark:bg-[#1e2030] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 mr-2">
                          <input
                            type="checkbox"
                            checked={scheduleConfig.lastDayOfMonth}
                            onChange={(e) => updateSchedule({ lastDayOfMonth: e.target.checked })}
                          />
                          <span>آخرین روز هر ماه</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* تاریخ شروع و پایان اعتبار زمانبند */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        تاریخ شروع اعتبار زمانبندی (اختیاری):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={scheduleConfig.startDate || ''}
                        onChange={(e) => updateSchedule({ startDate: e.target.value })}
                        placeholder="1405-01-01 یا 2026-03-21"
                        className="w-full font-mono px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        تاریخ توقف / انقضای زمانبندی (اختیاری):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={scheduleConfig.endDate || ''}
                        onChange={(e) => updateSchedule({ endDate: e.target.value })}
                        placeholder="1405-12-29 یا 2027-03-20"
                        className="w-full font-mono px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* نوار پیش‌نمایش زنده زمان اجرای بعدی */}
                  <div className="p-3 rounded-xl bg-cyan-100/80 dark:bg-cyan-950/70 border border-cyan-300 dark:border-cyan-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-700 dark:text-cyan-400 shrink-0" />
                      <span className="font-bold text-cyan-900 dark:text-cyan-200">
                        پیش‌نمایش زمانبندی: {nextRunPreviewText}
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-800 dark:text-cyan-300 font-mono">
                      NextRunAt خودکار محاسبه و ذخیره خواهد شد
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* فوتر مودال اصلی */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={savingTable}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              انصراف
            </button>

            <button
              type="submit"
              disabled={savingTable || excelPreviewLoading || (isExcelPreviewActive && checkedColumns.length === 0)}
              className={`px-6 py-2 rounded-xl text-white text-xs font-bold transition shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                tableForm.sourceType === 'Excel'
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              }`}
            >
              {savingTable
                ? (tableForm.sourceType === 'Excel' ? 'در حال ذخیره و ورود داده‌ها...' : 'در حال ذخیره...')
                : (tableForm.sourceType === 'Excel' && (!editingTable || excelFile)
                    ? 'ذخیره جدول مرجع و ورود داده‌ها'
                    : 'ذخیره جدول مرجع')}
            </button>
          </div>
        </form>
      </div>

      {/* ============================================================== */}
      {/* مودال بازبینی کامل داده‌ها و فیلترگذاری (Section 3 Sub-Modal) */}
      {/* ============================================================== */}
      {fullPreviewOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-60 flex items-center justify-center p-3">
          <div className="bg-white dark:bg-[#181926] w-full max-w-5xl h-[92vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 animate-in fade-in">
            {/* هدر مودال بازبینی */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#12131d]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span>بازبینی کامل داده‌ها و شروط فیلترگذاری</span>
                    {fullPreviewData && (
                      <span className="text-xs font-normal text-slate-400">
                        (کل رکوردهای مبدأ: {fullPreviewData.totalCount.toLocaleString('fa-IR')} رکورد
                        {fullPreviewData.isTruncated && ' - سقف ایمن ۲۰,۰۰۰ سطر'})
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    رکوردهای واکشی‌شده از SQL Server را بررسی کرده و شروط نگهداری داده در کش را تعیین کنید.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFullPreviewOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* بدنه مودال بازبینی */}
            <div className="flex-1 overflow-hidden flex flex-col p-5 space-y-3">
              {fullPreviewLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-slate-500 font-bold">در حال واکشی کامل رکوردهای کوئری از SQL Server...</span>
                </div>
              ) : fullPreviewError ? (
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 text-rose-700 text-xs">
                  {fullPreviewError}
                </div>
              ) : fullPreviewData ? (
                <>
                  {/* ردیف آمار و شمارش */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-slate-50 dark:bg-[#1e2030] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-500">کل رکوردهای خوانده‌شده:</span>
                      <span className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100">
                        {fullPreviewData.totalCount.toLocaleString('fa-IR')}
                      </span>
                    </div>

                    <div className="bg-cyan-50 dark:bg-cyan-950/40 p-3 rounded-2xl border border-cyan-200 dark:border-cyan-800 flex items-center justify-between">
                      <span className="text-xs text-cyan-800 dark:text-cyan-300 font-bold">منطبق با فیلترها (جهت همگام‌سازی):</span>
                      <span className="text-sm font-bold font-mono text-cyan-700 dark:text-cyan-300">
                        {filteredRows.filter(r => !excludedKeys.has(String(r[tableForm.uniqueKeyColumn] || ''))).length.toLocaleString('fa-IR')}
                      </span>
                    </div>

                    <div className="bg-rose-50 dark:bg-rose-950/40 p-3 rounded-2xl border border-rose-200 dark:border-rose-800 flex items-center justify-between">
                      <span className="text-xs text-rose-800 dark:text-rose-300">مستثنی‌شده (حذف دستی):</span>
                      <span className="text-sm font-bold font-mono text-rose-700 dark:text-rose-300">
                        {excludedKeys.size.toLocaleString('fa-IR')}
                      </span>
                    </div>
                  </div>

                  {/* نوار جستجوی سراسری و فیلترساز ستونی */}
                  <div className="bg-slate-50 dark:bg-[#1e2030] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* جستجوی زنده سراسری */}
                      <div className="relative flex-1 min-w-[220px]">
                        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPreviewPage(1);
                          }}
                          placeholder="جستجوی سریع در تمام ستون‌ها..."
                          className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none"
                        />
                      </div>

                      {/* شروط ستونی */}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={newRuleCol}
                          onChange={(e) => setNewRuleCol(e.target.value)}
                          className="text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181926] text-slate-800 dark:text-slate-100"
                        >
                          {fullPreviewData.columns.map(c => (
                            <option key={c.name} value={c.name}>{c.name}</option>
                          ))}
                        </select>

                        <select
                          value={newRuleOp}
                          onChange={(e) => setNewRuleOp(e.target.value)}
                          className="text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181926] text-slate-800 dark:text-slate-100"
                        >
                          <option value="contains">شامل متن (contains)</option>
                          <option value="equals">دقیقاً برابر (equals)</option>
                          <option value="not_equals">مخالف (not equals)</option>
                          <option value="not_contains">شامل نباشد (not contains)</option>
                          <option value="starts_with">شروع با (starts with)</option>
                          <option value="gt">بزرگتر از (gt)</option>
                          <option value="lt">کوچکتر از (lt)</option>
                          <option value="is_not_empty">غیرخالی (not empty)</option>
                        </select>

                        {newRuleOp !== 'is_not_empty' && (
                          <input
                            type="text"
                            value={newRuleVal}
                            onChange={(e) => setNewRuleVal(e.target.value)}
                            placeholder="مقدار شرط..."
                            className="w-32 text-xs px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181926] text-slate-800 dark:text-slate-100"
                          />
                        )}

                        <button
                          type="button"
                          onClick={handleAddFilterRule}
                          className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition cursor-pointer"
                        >
                          + افزودن شرط
                        </button>
                      </div>
                    </div>

                    {/* لیست شروط فیلتر فعال */}
                    {filterRules.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-bold text-slate-500">شروط فعال:</span>
                        {filterRules.map((r, rIdx) => (
                          <span
                            key={rIdx}
                            className="inline-flex items-center gap-1.5 text-[11px] bg-cyan-100 dark:bg-cyan-950/80 text-cyan-900 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-800 px-2.5 py-1 rounded-lg font-bold"
                          >
                            <span>{r.column} {r.operator} "{r.value}"</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFilterRule(rIdx)}
                              className="text-cyan-700 hover:text-rose-600 cursor-pointer"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setFilterRules([]);
                            setPreviewPage(1);
                          }}
                          className="text-[10px] text-rose-500 hover:underline font-bold mr-2 cursor-pointer"
                        >
                          حذف همه شروط
                        </button>
                      </div>
                    )}
                  </div>

                  {/* جدول رکوردهای فیلترشده با صفحه بندی سریع */}
                  <div className="flex-1 overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-[#1e2030]">
                    <table className="w-full text-xs text-right border-collapse">
                      <thead className="bg-slate-100 dark:bg-[#12131d] text-slate-700 dark:text-slate-200 font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-3 w-12 text-center border-b border-slate-200 dark:border-slate-800">
                            مستثنی
                          </th>
                          <th className="p-3 w-12 text-center border-b border-slate-200 dark:border-slate-800">#</th>
                          {fullPreviewData.columns.map(c => (
                            <th key={c.name} className="p-3 border-b border-slate-200 dark:border-slate-800">
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={fullPreviewData.columns.length + 2} className="p-8 text-center text-slate-400">
                              هیچ رکوردی منطبق با جستجو و شروط فیلتر یافت نشد.
                            </td>
                          </tr>
                        ) : (
                          paginatedRows.map((row, idx) => {
                            const keyVal = String(row[tableForm.uniqueKeyColumn] || '');
                            const isExcluded = keyVal && excludedKeys.has(keyVal);
                            const rowNum = (previewPage - 1) * pageSize + idx + 1;

                            return (
                              <tr
                                key={idx}
                                className={`transition ${
                                  isExcluded
                                    ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-900 opacity-60'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="p-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={!isExcluded}
                                    onChange={() => toggleExcludeKey(keyVal)}
                                    title={isExcluded ? 'کلیک جهت فعال‌سازی مجدد' : 'کلیک جهت مستثنی‌کردن این رکورد'}
                                    className="cursor-pointer"
                                  />
                                </td>
                                <td className="p-2.5 text-center font-mono text-slate-400 text-[11px]">{rowNum}</td>
                                {fullPreviewData.columns.map(c => (
                                  <td
                                    key={c.name}
                                    className={`p-2.5 font-mono text-[11px] ${
                                      isExcluded ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    {String(row[c.name] ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* نوار کنترل صفحه بندی */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>
                      نمایش ردیف {((previewPage - 1) * pageSize + 1).toLocaleString('fa-IR')} تا{' '}
                      {Math.min(previewPage * pageSize, filteredRows.length).toLocaleString('fa-IR')} از مجموع{' '}
                      {filteredRows.length.toLocaleString('fa-IR')} رکورد
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={previewPage <= 1}
                        onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        قبلی
                      </button>
                      <span className="font-mono font-bold px-2">
                        {previewPage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={previewPage >= totalPages}
                        onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        بعدی
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* فوتر مودال بازبینی */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#12131d]">
              <div className="text-xs text-slate-500">
                {excludedKeys.size > 0 && (
                  <span className="text-rose-600 font-bold ml-2">
                    {excludedKeys.size} رکورد مستثنی شده‌اند و همگام‌سازی نخواهند شد.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFullPreviewOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={handleApplyFiltersToTable}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold transition shadow-md shadow-cyan-600/20 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>اعمال فیلترها در همگام‌سازی</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
