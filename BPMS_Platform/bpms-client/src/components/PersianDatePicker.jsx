import React, { useState, useRef, useEffect } from 'react';
import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';
import { Calendar, ChevronRight, ChevronLeft } from 'lucide-react';

export function toPersianDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')} - ${hours}:${minutes}`;
}

export function toPersianDateOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
}

export function toPersianTimeOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function getTodayJalaliStr() {
  const today = new Date();
  const currentJ = toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return `${currentJ.jy}/${String(currentJ.jm).padStart(2, '0')}/${String(currentJ.jd).padStart(2, '0')}`;
}

export function buildIsoFromJalaliAndTime(jalaliDate, timeStr) {
  if (!jalaliDate || !jalaliDate.includes('/')) return null;
  const parts = jalaliDate.split('/').map(p => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const g = toGregorian(parts[0], parts[1], parts[2]);
  const [hh, mm] = (timeStr && timeStr.includes(':')) ? timeStr.split(':').map(x => parseInt(x, 10)) : [23, 59];
  const dt = new Date(g.gy, g.gm - 1, g.gd, isNaN(hh) ? 23 : hh, isNaN(mm) ? 59 : mm, 0);
  return dt.toISOString();
}

export function getFormDeadlineInfo(form) {
  if (!form) return null;
  try {
    const s = typeof form.parsedSchema === 'object' && form.parsedSchema
      ? form.parsedSchema
      : JSON.parse(form.schemaJson || '{}');
    if (s.publicExpiresAt || s.publicCloseDate) {
      return {
        closeDate: s.publicCloseDate || '',
        closeTime: s.publicCloseTime || '',
        expiresAt: s.publicExpiresAt || null
      };
    }
  } catch (e) {}
  return null;
}

export function isPublicSurveyClosed(form) {
  if (!form) return { closed: true, reason: 'فرم نظرسنجی یافت نشد.', expiredByTime: false };
  if (form.status !== 'Active') {
    return { closed: true, reason: 'این فرم نظرسنجی در حال حاضر غیرفعال یا بسته شده است.', expiredByTime: false };
  }
  const deadline = getFormDeadlineInfo(form);
  if (deadline?.expiresAt) {
    const exp = new Date(deadline.expiresAt);
    if (!isNaN(exp.getTime()) && new Date() >= exp) {
      return {
        closed: true,
        expiredByTime: true,
        reason: `مهلت زمانی تکمیل این نظرسنجی در تاریخ ${deadline.closeDate} ساعت ${deadline.closeTime} به پایان رسیده و فرم به صورت خودکار غیرفعال شده است.`
      };
    }
  }
  return { closed: false, reason: '', expiredByTime: false };
}

export const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

export default function PersianDatePicker({
  value,
  onChange,
  placeholder = 'انتخاب تاریخ شمسی...',
  disabled = false,
  id = null,
  tabIndex = undefined,
  onKeyDown = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const today = new Date();
  const currentJ = toJalaali(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const parseVal = () => {
    if (value && typeof value === 'string' && value.includes('/')) {
      const parts = value.split('/').map(p => parseInt(p, 10));
      if (parts.length === 3 && !isNaN(parts[0])) {
        return { jy: parts[0], jm: parts[1], jd: parts[2] };
      }
    }
    return { jy: currentJ.jy, jm: currentJ.jm, jd: currentJ.jd };
  };

  const [viewState, setViewState] = useState(parseVal());

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeMonth = (delta) => {
    let nextM = viewState.jm + delta;
    let nextY = viewState.jy;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    } else if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    setViewState({ ...viewState, jy: nextY, jm: nextM });
  };

  const daysInMonth = jalaaliMonthLength(viewState.jy, viewState.jm);
  const firstDayGreg = toGregorian(viewState.jy, viewState.jm, 1);
  const gDate = new Date(firstDayGreg.gy, firstDayGreg.gm - 1, firstDayGreg.gd);
  const startDayOfWeek = (gDate.getDay() + 1) % 7;

  const handleSelectDay = (day) => {
    const formatted = `${viewState.jy}/${String(viewState.jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        id={id}
        tabIndex={disabled ? -1 : (tabIndex ?? 0)}
        onKeyDown={onKeyDown}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-700'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] cursor-pointer hover:border-indigo-400'
        }`}
      >
        <span className={value ? 'text-slate-800 dark:text-slate-100 font-mono font-medium' : 'text-slate-400'}>
          {value || placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 right-0 w-72 bg-white dark:bg-[#252736] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 select-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700">
            <button type="button" onClick={() => changeMonth(1)} className="p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-100">
              {PERSIAN_MONTHS[viewState.jm - 1]} {viewState.jy}
            </span>
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
            <span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <span key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const formatted = `${viewState.jy}/${String(viewState.jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
              const isSelected = value === formatted;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 w-8 rounded-lg flex items-center justify-center font-mono transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={() => {
                const todayStr = `${currentJ.jy}/${String(currentJ.jm).padStart(2, '0')}/${String(currentJ.jd).padStart(2, '0')}`;
                onChange(todayStr);
                setIsOpen(false);
              }}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              امروز
            </button>
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className="text-slate-400 hover:text-rose-500 cursor-pointer"
            >
              پاک کردن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { PersianDatePicker };
