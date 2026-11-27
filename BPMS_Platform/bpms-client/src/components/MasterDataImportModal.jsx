import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileSpreadsheet, Lock, Upload, X } from 'lucide-react';
import api from '../api';
import { useDialog } from './GlobalDialogProvider';
import {
  ExcelFileUploadBox,
  ExcelKeyValidationBanner,
  ExcelLivePreviewTable,
  ExcelSheetSelector,
  findMatchingExcelHeader
} from './MasterDataExcelShared';

export default function MasterDataImportModal({
  isOpen,
  onClose,
  importTable,
  importFile,
  setImportFile,
  importing,
  handleSubmitImport,
  handleDownloadTemplate
}) {
  const { toast } = useDialog();
  const [preview, setPreview] = useState(null);
  const [sheetName, setSheetName] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [columnMappingsState, setColumnMappingsState] = useState([]);

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setSheetName('');
      setPreviewLoading(false);
      setPreviewError('');
      setColumnMappingsState([]);
    }
  }, [isOpen]);

  const buildInitialMappings = (table, excelCols) => {
    const tableCols = table?.columns || [];
    const uniqueKeyLower = (table?.uniqueKeyColumn || '').trim().toLowerCase();

    return tableCols.map((col) => {
      const isUniqueKey = (col.name || '').trim().toLowerCase() === uniqueKeyLower;
      const matchedSource = findMatchingExcelHeader(col, excelCols);
      return {
        name: col.name,
        title: col.title || col.name,
        dataType: col.dataType || 'string',
        isUniqueKey,
        included: isUniqueKey ? true : Boolean(matchedSource),
        sourceHeader: matchedSource
      };
    });
  };

  const fetchPreview = async (file, requestedSheet = null) => {
    if (!file || !importTable) return;
    setPreviewLoading(true);
    setPreviewError('');
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
      setPreview(data);
      setSheetName(data.selectedSheetName || '');
      setColumnMappingsState(buildInitialMappings(importTable, data.columns || []));
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'خطا در خواندن فایل اکسل یا CSV';
      setPreviewError(msg);
      if (!requestedSheet) {
        setPreview(null);
        setColumnMappingsState([]);
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSelectFile = (file) => {
    setImportFile(file);
    fetchPreview(file, null);
  };

  const handleClearFile = () => {
    setImportFile(null);
    setPreview(null);
    setSheetName('');
    setPreviewError('');
    setColumnMappingsState([]);
  };

  const handleChangeSheet = (nextSheet) => {
    setSheetName(nextSheet);
    if (importFile) {
      fetchPreview(importFile, nextSheet);
    }
  };

  const handleToggleColumn = (idx) => {
    setColumnMappingsState((prev) =>
      prev.map((item, i) => {
        if (i !== idx || item.isUniqueKey) return item;
        const nextIncluded = !item.included;
        let nextSource = item.sourceHeader;
        if (nextIncluded && !nextSource && preview?.columns?.length > 0) {
          nextSource = findMatchingExcelHeader(item, preview.columns) || preview.columns[0]?.sourceHeader || '';
        }
        return { ...item, included: nextIncluded, sourceHeader: nextSource };
      })
    );
  };

  const handleChangeSourceHeader = (idx, nextHeader) => {
    setColumnMappingsState((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, sourceHeader: nextHeader, included: item.isUniqueKey ? true : Boolean(nextHeader) }
          : item
      )
    );
  };

  const handleToggleAllOptional = () => {
    setColumnMappingsState((prev) => {
      const optionalCols = prev.filter((c) => !c.isUniqueKey);
      const allChecked = optionalCols.length > 0 && optionalCols.every((c) => c.included);
      return prev.map((c) => {
        if (c.isUniqueKey) return c;
        const nextInc = !allChecked;
        const matched = nextInc && !c.sourceHeader ? findMatchingExcelHeader(c, preview?.columns || []) : c.sourceHeader;
        return { ...c, included: nextInc, sourceHeader: matched };
      });
    });
  };

  const activeMappedColumns = useMemo(() => {
    return columnMappingsState.filter((c) => c.included && c.sourceHeader);
  }, [columnMappingsState]);

  const uniqueKeyMapping = useMemo(() => {
    return columnMappingsState.find((c) => c.isUniqueKey) || null;
  }, [columnMappingsState]);

  const uniqueKeyStats = useMemo(() => {
    if (!preview || !uniqueKeyMapping?.sourceHeader) return null;
    return preview.columnStats?.[uniqueKeyMapping.sourceHeader] || null;
  }, [preview, uniqueKeyMapping]);

  const onFormSubmit = (e) => {
    e.preventDefault();
    if (!importFile) {
      toast.warning('لطفاً فایل اکسل یا CSV را انتخاب نمایید.');
      return;
    }
    if (!preview) {
      toast.warning('لطفاً تا تکمیل تحلیل ساختار فایل صبر نمایید.');
      return;
    }
    if (!uniqueKeyMapping?.sourceHeader) {
      toast.warning(`انتخاب ستون فایل اکسل برای کلید یکتا («${importTable.uniqueKeyColumn}») الزامی است.`);
      return;
    }
    if ((preview.totalRows || 0) === 0) {
      toast.warning('هیچ ردیف داده‌ای در شیت انتخاب‌شده یافت نشد.');
      return;
    }
    if (uniqueKeyStats && uniqueKeyStats.emptyCount >= preview.totalRows) {
      toast.error('تمام ردیف‌های ستون کلید یکتا خالی هستند. لطفاً ستون نگاشت کلید یکتا را اصلاح کنید.');
      return;
    }

    const columnMappings = activeMappedColumns.map((c) => ({
      sourceHeader: c.sourceHeader,
      targetColumnName: c.name
    }));

    handleSubmitImport(e, {
      file: importFile,
      sheetName,
      columnMappings
    });
  };

  if (!isOpen || !importTable) return null;

  const optionalColsCount = columnMappingsState.filter((c) => !c.isUniqueKey).length;
  const allOptionalChecked = optionalColsCount > 0 && columnMappingsState.filter((c) => !c.isUniqueKey).every((c) => c.included);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#181926]">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                ایمپورت و به‌روزرسانی از اکسل / CSV در جدول «{importTable.title}»
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                کد جدول: {importTable.code} | کلید یکتا: {importTable.uniqueKeyColumn}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* باکس دانلود قالب نمونه */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                دانلود قالب نمونه ورودی:
              </span>
              <button
                type="button"
                onClick={() => handleDownloadTemplate(importTable)}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-[#1e2030] px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود قالب CSV نمونه</span>
              </button>
            </div>
            <p className="text-[11px] text-emerald-800/80 dark:text-emerald-400 leading-relaxed">
              قالب حاوی ستون‌های تعریف‌شده جدول و دو سطر نمونه با رمزگذاری استاندارد فارسی (UTF-8) است. همچنین می‌توانید فایل اکسل دلخواه خود (`.xlsx`، `.xls` یا `.csv`) را بارگذاری و ستون‌ها را نگاشت دهید.
            </p>
          </div>

          {/* انتخاب فایل اکسل / CSV */}
          <div className="space-y-3">
            <ExcelFileUploadBox
              file={importFile}
              loading={previewLoading}
              error={previewError}
              onSelectFile={handleSelectFile}
              onClearFile={handleClearFile}
              title="انتخاب فایل داده‌ها (.xlsx، .xls یا .csv)"
            />

            {preview && (
              <ExcelSheetSelector
                sheetNames={preview.sheetNames}
                selectedSheetName={sheetName}
                onChangeSheet={handleChangeSheet}
                loading={previewLoading}
              />
            )}
          </div>

          {/* انتخاب ستون‌ها و نگاشت ستون‌های جدول به فایل اکسل */}
          {preview && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    انتخاب ستون‌ها و نگاشت به سرستون‌های فایل اکسل
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    ستون کلید یکتا اجباری است؛ سایر ستون‌ها را می‌توانید برای به‌روزرسانی انتخاب یا غیرفعال کنید (ستون‌های تیک‌نخورده در رکوردهای فعلی حفظ می‌شوند).
                  </p>
                </div>

                {optionalColsCount > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllOptional}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{allOptionalChecked ? 'لغو انتخاب ستون‌های اختیاری' : 'انتخاب همه ستون‌های اختیاری'}</span>
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {columnMappingsState.map((col, idx) => (
                  <div
                    key={col.name}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition ${
                      col.included
                        ? col.isUniqueKey
                          ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/15'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926]'
                        : 'border-slate-200/60 dark:border-slate-800 bg-slate-100/50 dark:bg-[#151622] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={col.included}
                        disabled={col.isUniqueKey}
                        onChange={() => handleToggleColumn(idx)}
                        title={col.isUniqueKey ? 'ستون کلید یکتا اجباری است' : 'انتخاب این ستون برای به‌روزرسانی'}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                      />

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                            {col.title}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400" dir="ltr">
                            ({col.name})
                          </span>
                          {col.isUniqueKey && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60">
                              <Lock className="w-3 h-3" />
                              کلید یکتا (الزامی)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="sm:w-64 shrink-0">
                      <select
                        disabled={!col.included}
                        value={col.sourceHeader}
                        onChange={(e) => handleChangeSourceHeader(idx, e.target.value)}
                        className={`w-full text-xs px-3 py-1.5 rounded-xl border bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 disabled:opacity-50 ${
                          col.isUniqueKey && !col.sourceHeader
                            ? 'border-rose-400 dark:border-rose-500'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <option value="">-- انتخاب ستون متناظر از فایل --</option>
                        {(preview.columns || []).map((ec) => (
                          <option key={ec.sourceHeader} value={ec.sourceHeader}>
                            {ec.sourceHeader}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* اعتبارسنجی کلید یکتا و جدول پیش‌نمایش ۱۰ ردیف اول */}
          {preview && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <ExcelKeyValidationBanner
                totalRows={preview.totalRows || 0}
                keyColumnLabel={
                  uniqueKeyMapping
                    ? `${uniqueKeyMapping.title} (${uniqueKeyMapping.sourceHeader || 'نگاشت نشده'})`
                    : importTable.uniqueKeyColumn
                }
                keyStats={uniqueKeyStats}
                hasKeyMapping={Boolean(uniqueKeyMapping?.sourceHeader)}
              />

              <ExcelLivePreviewTable
                columns={activeMappedColumns}
                previewRows={preview.previewRows || []}
                totalRows={preview.totalRows || 0}
                uniqueKeyColumnName={importTable.uniqueKeyColumn}
              />
            </div>
          )}

          <div className="p-3 bg-slate-50 dark:bg-[#181926] rounded-xl text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            💡 <b>مکانیزم همگام‌سازی هوشمند (Upsert):</b> رکوردهای موجود بر اساس ستون «{importTable.uniqueKeyColumn}» به‌روزرسانی و رکوردهای جدید درج می‌شوند. رکوردهایی که در فایل نباشند، جهت حفظ سلامت سوابق فرم‌ها، غیرفعال خواهند شد.
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer disabled:opacity-50"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={importing || previewLoading || !importFile || !preview || !uniqueKeyMapping?.sourceHeader}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 shadow-md shadow-emerald-600/20"
            >
              <Upload className={`w-3.5 h-3.5 ${importing ? 'animate-spin' : ''}`} />
              <span>{importing ? 'در حال بارگذاری و همگام‌سازی...' : 'بارگذاری و اجرای همگام‌سازی'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
