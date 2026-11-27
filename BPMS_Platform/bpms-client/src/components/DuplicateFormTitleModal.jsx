import React from 'react';
import { AlertTriangle, CopyPlus, Edit3, X } from 'lucide-react';

/**
 * تولید عنوان پیشنهادی دارای شماره‌گذاری ترتیبی (مثلاً "(2)" یا "(3)")
 * در صورتی که فرمی با همان عنوان قبلاً در لیست فرم‌ها موجود باشد.
 */
export function getSuggestedTitle(currentTitle, existingTitles = []) {
  const cleanTitle = (currentTitle || '').trim();
  if (!cleanTitle) return 'فرم جدید';

  // استخراج بخش اصلی عنوان و شماره فعلی در صورت وجود: "درخواست مرخصی (2)" -> "درخواست مرخصی", "2"
  const baseMatch = cleanTitle.match(/^(.*?)(?:\s*\((\d+)\))?$/);
  const base = (baseMatch && baseMatch[1] ? baseMatch[1] : cleanTitle).trim();

  const existingSet = new Set(
    (existingTitles || []).map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
  );

  let counter = 2;
  if (baseMatch && baseMatch[2]) {
    counter = Math.max(2, parseInt(baseMatch[2], 10) + 1);
  }

  while (existingSet.has(`${base} (${counter})`.toLowerCase())) {
    counter++;
  }

  return `${base} (${counter})`;
}

/**
 * مودال تاییدیه ممانعت از ایجاد فرم همنام
 */
export default function DuplicateFormTitleModal({
  isOpen,
  title,
  suggestedTitle,
  onAddNumberAndSave,
  onRenameManually,
  onClose
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e2230] w-full max-w-lg rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-800/50 p-6 space-y-5 text-right font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center border border-amber-200 dark:border-amber-800/60">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              هشدار تکراری بودن عنوان فرم
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose || onRenameManually}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          فرمی با نام <span className="font-bold text-amber-600 dark:text-amber-400">«{title}»</span> قبلاً ایجاد شده است. آیا مایلید شماره به انتهای نام اضافه شود (<span className="font-bold text-emerald-600 dark:text-emerald-400">«{suggestedTitle}»</span>) یا نام فرم را تغییر می‌دهید؟
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onAddNumberAndSave}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm transition cursor-pointer"
          >
            <CopyPlus className="w-4 h-4" />
            <span>افزودن شماره و ذخیره ({suggestedTitle})</span>
          </button>

          <button
            type="button"
            onClick={onRenameManually}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
            <span>تغییر نام توسط خودم</span>
          </button>
        </div>
      </div>
    </div>
  );
}
