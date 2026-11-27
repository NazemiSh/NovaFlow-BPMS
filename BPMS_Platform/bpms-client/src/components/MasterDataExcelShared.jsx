import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Table as TableIcon,
  UploadCloud,
  X,
  XCircle
} from 'lucide-react';

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function pickBestUniqueKeyColumn(columns = []) {
  const included = columns.filter((c) => c.included !== false && c.name);
  if (included.length === 0) return '';
  const match = included.find((c) => {
    const n = (c.name || '').toLowerCase();
    const t = (c.title || '').toLowerCase();
    return (
      n === 'id' ||
      n === 'code' ||
      n.includes('code') ||
      n.endsWith('id') ||
      t.includes('کد') ||
      t.includes('شناسه')
    );
  });
  return (match || included[0]).name;
}

export function findMatchingExcelHeader(targetCol, excelColumns = []) {
  if (!targetCol || !Array.isArray(excelColumns) || excelColumns.length === 0) return '';
  const targetName = (targetCol.name || '').trim().toLowerCase();
  const targetTitle = (targetCol.title || '').trim().toLowerCase();

  const exactByHeader = excelColumns.find(
    (ec) => (ec.sourceHeader || '').trim().toLowerCase() === targetName
  );
  if (exactByHeader) return exactByHeader.sourceHeader;

  const exactByTitle = excelColumns.find(
    (ec) => targetTitle && (ec.sourceHeader || '').trim().toLowerCase() === targetTitle
  );
  if (exactByTitle) return exactByTitle.sourceHeader;

  const exactBySuggestedName = excelColumns.find(
    (ec) => (ec.suggestedName || '').trim().toLowerCase() === targetName
  );
  if (exactBySuggestedName) return exactBySuggestedName.sourceHeader;

  return '';
}

export function ExcelFileUploadBox({
  file,
  loading,
  error,
  onSelectFile,
  onClearFile,
  title = 'انتخاب فایل اکسل یا CSV (.xlsx، .xls، .csv)'
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFilePicked = (picked) => {
    if (!picked) return;
    onSelectFile(picked);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] || null;
          if (picked) handleFilePicked(picked);
          e.target.value = '';
        }}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer?.files?.[0];
            if (dropped) handleFilePicked(dropped);
          }}
          className={`flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-dashed transition cursor-pointer ${
            dragging
              ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/30'
              : 'border-emerald-300 dark:border-emerald-800/70 bg-white dark:bg-[#1e2030] hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
          }`}
        >
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              فایل را اینجا بکشید و رها کنید یا کلیک نمایید (پشتیبانی از .xlsx، .xls و .csv)
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-white dark:bg-[#1e2030]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" dir="ltr">
                {file.name}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {loading ? 'در حال خواندن شیت‌ها و تحلیل ساختار فایل...' : formatFileSize(file.size)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              تعویض فایل
            </button>
            {onClearFile && (
              <button
                type="button"
                disabled={loading}
                onClick={onClearFile}
                title="حذف فایل انتخاب‌شده"
                aria-label="حذف فایل انتخاب‌شده"
                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export function ExcelSheetSelector({
  sheetNames = [],
  selectedSheetName = '',
  onChangeSheet,
  loading = false
}) {
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) return null;

  if (sheetNames.length === 1) {
    return (
      <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-100/80 dark:bg-[#1e2030] border border-slate-200 dark:border-slate-700 text-xs">
        <span className="text-slate-500 dark:text-slate-400 font-medium">شیت فعال فایل:</span>
        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-lg">
          {selectedSheetName || sheetNames[0]}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60">
      <label className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-2 shrink-0">
        <TableIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span>انتخاب شیت (Sheet):</span>
      </label>
      <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
        <select
          value={selectedSheetName}
          disabled={loading}
          onChange={(e) => onChangeSheet(e.target.value)}
          className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        >
          {sheetNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
          ({sheetNames.length} شیت)
        </span>
      </div>
    </div>
  );
}

export function ExcelKeyValidationBanner({
  totalRows = 0,
  keyColumnLabel = '',
  keyStats = null,
  hasKeyMapping = true
}) {
  if (totalRows === 0) {
    return (
      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span>هیچ ردیف داده‌ای در این شیت یافت نشد.</span>
      </div>
    );
  }

  if (!hasKeyMapping || !keyStats) {
    return (
      <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
        <XCircle className="w-4 h-4 shrink-0" />
        <span>لطفاً برای ستون کلید یکتا، ستون متناظر در فایل اکسل را مشخص نمایید.</span>
      </div>
    );
  }

  const emptyCount = keyStats.emptyCount || 0;
  const duplicateCount = keyStats.duplicateCount || 0;
  const allRowsEmpty = emptyCount >= totalRows;
  const hasWarnings = emptyCount > 0 || duplicateCount > 0;

  return (
    <div
      className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
        allRowsEmpty
          ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          : hasWarnings
          ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-emerald-800 dark:text-emerald-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-bold">
          {allRowsEmpty ? (
            <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : hasWarnings ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span>
            {allRowsEmpty
              ? `خطای اعتبارسنجی کلید یکتا («${keyColumnLabel}»): تمام ردیف‌ها خالی هستند!`
              : hasWarnings
              ? `هشدار اعتبارسنجی ستون کلید یکتا («${keyColumnLabel}»):`
              : `ستون کلید یکتا («${keyColumnLabel}») در تمامی ردیف‌ها معتبر و یکتا است.`}
          </span>
        </div>
        <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/80 dark:bg-[#1e2030] border border-current/20">
          مجموع ردیف‌های شیت: {totalRows.toLocaleString('fa-IR')} ردیف
        </span>
      </div>

      {emptyCount > 0 && (
        <p className="text-[11px] leading-relaxed pr-6">
          • <b>{emptyCount.toLocaleString('fa-IR')}</b> ردیف در ستون کلید یکتا مقدار خالی (Null/Empty) دارند
          {keyStats.sampleEmptyRowNumbers?.length > 0 && (
            <span className="font-mono opacity-85">
              {' '}(نمونه ردیف‌ها: {keyStats.sampleEmptyRowNumbers.join('، ')})
            </span>
          )}
          ؛ ردیف‌های فاقد کلید یکتا در هنگام ایمپورت نادیده گرفته می‌شوند.
        </p>
      )}

      {duplicateCount > 0 && (
        <p className="text-[11px] leading-relaxed pr-6">
          • <b>{duplicateCount.toLocaleString('fa-IR')}</b> مقدار تکراری (Duplicate) در ستون کلید یکتا شناسایی شد
          {keyStats.sampleDuplicateValues?.length > 0 && (
            <span className="font-mono opacity-85" dir="ltr">
              {' '}({keyStats.sampleDuplicateValues.join(', ')})
            </span>
          )}
          ؛ در فرآیند Upsert، آخرین مقدار تکراری جایگزین خواهد شد.
        </p>
      )}
    </div>
  );
}

export function ExcelLivePreviewTable({
  columns = [],
  previewRows = [],
  totalRows = 0,
  uniqueKeyColumnName = ''
}) {
  if (!columns || columns.length === 0) {
    return (
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-center text-xs text-slate-400">
        حداقل یک ستون را برای مشاهده پیش‌نمایش زنده تیک بزنید.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="font-bold text-slate-700 dark:text-slate-200">
          پیش‌نمایش زنده داده‌ها (نمایش {Math.min(10, previewRows.length).toLocaleString('fa-IR')} ردیف اول از{' '}
          {totalRows.toLocaleString('fa-IR')} ردیف — فقط ستون‌های انتخاب‌شده):
        </span>
        <span className="text-slate-400 font-mono">
          {columns.length.toLocaleString('fa-IR')} ستون فعال
        </span>
      </div>

      <div className="overflow-x-auto max-h-64 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-[#1e2030]">
        <table className="w-full text-[11px] text-right border-collapse">
          <thead className="bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-2.5 w-10 text-center border-l border-slate-200 dark:border-slate-700">#</th>
              {columns.map((col, idx) => {
                const isKey = uniqueKeyColumnName && col.name?.toLowerCase() === uniqueKeyColumnName.toLowerCase();
                return (
                  <th
                    key={`${col.name}_${idx}`}
                    className="p-2.5 whitespace-nowrap border-l border-slate-200/70 dark:border-slate-700/70 last:border-l-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.title || col.name}</span>
                      {isKey && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                          کلید
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono font-normal text-slate-400 mt-0.5" dir="ltr">
                      {col.name}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {previewRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-6 text-center text-slate-400">
                  ردیفی برای پیش‌نمایش وجود ندارد.
                </td>
              </tr>
            ) : (
              previewRows.slice(0, 10).map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="p-2 text-center font-mono text-slate-400 border-l border-slate-100 dark:border-slate-800">
                    {rIdx + 1}
                  </td>
                  {columns.map((col, cIdx) => {
                    const sourceKey = col.sourceHeader || col.name;
                    const val = row?.[sourceKey];
                    const isEmpty = val === null || val === undefined || String(val).trim() === '';
                    const isKey = uniqueKeyColumnName && col.name?.toLowerCase() === uniqueKeyColumnName.toLowerCase();
                    return (
                      <td
                        key={`${col.name}_${cIdx}`}
                        className={`p-2 max-w-[220px] truncate border-l border-slate-100/80 dark:border-slate-800/80 last:border-l-0 ${
                          isEmpty && isKey
                            ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-bold'
                            : 'text-slate-700 dark:text-slate-200'
                        } ${col.dataType === 'number' || col.dataType === 'date' || isKey ? 'font-mono' : ''}`}
                        title={isEmpty ? '' : String(val)}
                      >
                        {isEmpty ? (isKey ? 'خالی!' : '—') : String(val)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
