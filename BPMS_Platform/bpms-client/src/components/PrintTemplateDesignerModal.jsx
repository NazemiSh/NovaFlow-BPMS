import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import api from '../api';
import {
  X, Plus, Trash2, Copy, Check, Printer, FileText, MoveUp, MoveDown,
  Layout, AlignRight, AlignCenter, AlignLeft, Eye, Save,
  Maximize2, Minimize2, ZoomIn, ZoomOut, QrCode, PenTool, Columns,
  Building2, Hash, Calendar, FileSignature, AlertCircle, RefreshCw,
  Scissors, Sliders, Palette, CheckSquare, GripVertical, Table,
  FilePlus, Layers, ShieldCheck, Bookmark, ArrowRightLeft, FileCheck, ChevronRight,
  Image as ImageIcon, Calculator, ChevronDown, ChevronUp, ChevronLeft
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { evaluateFormula, getNumericFieldsAndTables } from '../utils/formulaEvaluator';
import { useResponsiveSheetScale } from '../utils/useResponsiveSheetScale';
import { useDialog } from './GlobalDialogProvider';

// ابعاد استاندارد برگه به میلی‌متر
const PAPER_DIMENSIONS = {
  A4: { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } },
  A5: { portrait: { width: 148, height: 210 }, landscape: { width: 210, height: 148 } }
};

// رنگ‌های مجاز پس‌زمینه بلوک در پالت سازمانی با مقادیر دقیق HEX
export const BG_COLOR_OPTIONS = [
  { label: 'پیش‌فرض / شفاف', value: 'default', hex: 'transparent', printHex: 'transparent', isDark: false },
  { label: 'سرمه‌ای اداری', value: '#1e293b', hex: '#1e293b', printHex: '#f1f5f9', isDark: true },
  { label: 'آبی تیره ملایم', value: '#172554', hex: '#172554', printHex: '#eff6ff', isDark: true },
  { label: 'خاکستری گرافیتی', value: '#27272a', hex: '#27272a', printHex: '#f4f4f5', isDark: true },
  { label: 'سبز یشمی تیره', value: '#064e3b', hex: '#064e3b', printHex: '#f0fdf4', isDark: true },
  { label: 'کهربایی تیره', value: '#451a03', hex: '#451a03', printHex: '#fffbeb', isDark: true }
];

// تشخیص خودکار پس‌زمینه‌های تیره جهت تضمین خوانایی متن (Auto-Contrast)
export const isDarkColor = (color) => {
  if (!color || color === 'transparent' || color === 'default') return false;
  const c = String(color).toLowerCase().trim();
  return c === '#1e293b' || c === '#172554' || c === '#27272a' || c === '#064e3b' || c === '#451a03' || c === '#0f172a' || c === '#111827' || c === '#18181b';
};

// یکسان‌سازی کلیدهای اندازه فونت جهت حفظ سازگاری با نسخه‌های قبلی (base -> normal)
export const normalizeFontSizeKey = (fontSize) => {
  if (!fontSize || fontSize === 'base' || fontSize === 'md') return 'normal';
  if (['xs', 'sm', 'normal', 'lg'].includes(fontSize)) return fontSize;
  return 'normal';
};

// تبدیل کلید اندازه فونت به پیکسل دقیق جهت اعمال به صورت استایل خطی صریح
export const getFontSizePx = (fontSize) => {
  switch (normalizeFontSizeKey(fontSize)) {
    case 'xs': return 10;
    case 'sm': return 11;
    case 'normal': return 13;
    case 'lg': return 15;
    default: return 13;
  }
};

// اعتبارسنجی تراز متن جهت اعمال به صورت استایل خطی صریح بدون تداخل با کلاس‌های RTL
export const normalizeTextAlign = (textAlign) => {
  if (textAlign === 'center' || textAlign === 'left' || textAlign === 'right') {
    return textAlign;
  }
  return 'right';
};

// نرمال‌سازی بلوک‌ها جهت سازگاری با نسخه‌های قبلی و پشتیبانی از کادر سکشن (Section Container)
const normalizeBlock = (b) => {
  let zone = b.zone;
  if (!zone) {
    if (b.type === 'header') zone = 'header';
    else if (b.type === 'signatures' || b.type === 'qrCode') zone = 'footer';
    else if (b.type === 'staticText' && b.isFooter) zone = 'footer';
    else zone = 'body';
  }
  const isSection = b.type === 'sectionContainer' || b.type === 'sectionTitle';
  const showBorder = b.showBorder !== undefined ? b.showBorder : (b.hasBorder !== undefined ? b.hasBorder : (b.type !== 'header'));
  const rawBg = b.bgColor;
  const cleanBg = (!rawBg || rawBg === 'transparent' || rawBg === 'default' || rawBg === '#f8fafc' || rawBg === '#ffffff') ? 'default' : rawBg;
  return {
    ...b,
    type: isSection ? 'sectionContainer' : b.type,
    zone,
    page: b.page || 1,
    colSpan: isSection ? 2 : (b.colSpan || 1),
    borderStyle: b.borderStyle || (isSection ? 'dashed' : 'solid'),
    fontSize: normalizeFontSizeKey(b.fontSize),
    textAlign: normalizeTextAlign(b.textAlign),
    fieldIds: Array.isArray(b.fieldIds) ? b.fieldIds : [],
    fieldSettings: (b.fieldSettings && typeof b.fieldSettings === 'object') ? b.fieldSettings : {},
    showBorder: Boolean(showBorder),
    hasBorder: Boolean(showBorder),
    bgColor: cleanBg
  };
};

// قالب پیش‌فرض در صورت عدم وجود قالب قبلی
const createDefaultTemplate = (formTitle, formQuestions = []) => {
  const blocks = [
    {
      id: 'blk_header_' + Date.now(),
      type: 'header',
      zone: 'header',
      page: 1,
      showLogo: true,
      showTitle: true,
      showTrackingCode: true,
      showDate: true,
      colSpan: 2,
      showBorder: false,
      hasBorder: false
    }
  ];

  // افزودن کادر سکشن اول در بدنه به همراه فیلدهای واقعی اولیه فرم (بدون فیلدهای نوع section)
  const initialFieldIds = formQuestions
    .filter(q => q && q.type !== 'section' && q.type !== 'sectionContainer')
    .slice(0, 4)
    .map(q => q.id);
  blocks.push({
    id: 'blk_sec_' + Date.now(),
    type: 'sectionContainer',
    title: 'بخش اول: اطلاعات و مشخصات درخواست',
    description: 'اطلاعات هویتی و اقلام فرم ثبت‌شده در این کادر قرار می‌گیرند.',
    zone: 'body',
    page: 1,
    colSpan: 2,
    borderStyle: 'dashed',
    showBorder: true,
    hasBorder: true,
    fieldIds: initialFieldIds,
    bgColor: 'default'
  });

  // افزودن جدول تاییدات و گردش‌کار به ناحیه پاورقی
  blocks.push({
    id: 'blk_signatures_' + Date.now(),
    type: 'signatures',
    zone: 'footer',
    page: 1,
    title: 'جدول تاییدات و امضاهای گردش‌کار',
    colSpan: 2,
    showComments: true,
    showBorder: true,
    hasBorder: true
  });

  // افزودن کد QR و متن ثابت به عنوان پاورقی
  blocks.push({
    id: 'blk_qr_' + Date.now(),
    type: 'qrCode',
    zone: 'footer',
    page: 1,
    title: 'کد اصالت‌سنجی سند',
    colSpan: 1,
    showText: true,
    showBorder: true,
    hasBorder: true
  });

  blocks.push({
    id: 'blk_static_' + Date.now(),
    type: 'staticText',
    zone: 'footer',
    page: 1,
    content: 'این برگه طبق ضوابط سامانه جامع فرم‌ساز و گردش‌کار الکترونیک سازمان صادر شده و هرگونه دخل و تصرف پیگرد قانونی دارد.',
    colSpan: 1,
    fontSize: 'sm',
    textAlign: 'right',
    padding: 'sm',
    showBorder: true,
    hasBorder: true,
    bgColor: 'default'
  });

  return {
    id: 'tpl_default_' + Date.now(),
    name: 'برگه رسمی اداری (پیش‌فرض)',
    paperSize: 'A4',
    orientation: 'portrait',
    pageCount: 1,
    repeatHeaderOnAllPages: true,
    showImageAttachments: false,
    calculatedBoxes: [],
    footerPosition: 'lastPage', // 'lastPage' | 'allPages'
    margins: { top: 15, bottom: 15, left: 15, right: 15 },
    blocks: blocks
  };
};

export function CalculatedBoxesGrid({ boxes = [], answers = {}, onBoxClick = null, isSampleData = false }) {
  if (!boxes || boxes.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-slate-300 w-full !text-slate-900" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div className="flex items-center justify-between gap-1.5 mb-2.5">
        <div className="flex items-center gap-1.5 !text-slate-900 font-bold text-[11px]">
          <Calculator className="w-3.5 h-3.5 text-blue-600" />
          <span className="!text-slate-900">باکس‌های خلاصه و محاسبات فرمولی</span>
        </div>
        {isSampleData && (
          <span className="text-[9px] font-medium !text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            محاسبه با داده‌های نمونه
          </span>
        )}
      </div>
      <div className="grid grid-cols-12 gap-2.5">
        {boxes.map((box, bIdx) => {
          const colSpan = box.width === '1/1'
            ? 'col-span-12'
            : box.width === '1/2'
            ? 'col-span-12 sm:col-span-6'
            : 'col-span-12 sm:col-span-4';

          const { formatted, error } = evaluateFormula(box.formula, answers, box);
          const colorTheme = box.color || 'blue';
          const themeStyle = {
            blue: { border: '1px solid #bfdbfe', background: '#eff6ff', color: '#0f172a' },
            emerald: { border: '1px solid #a7f3d0', background: '#ecfdf5', color: '#0f172a' },
            purple: { border: '1px solid #e9d5ff', background: '#faf5ff', color: '#0f172a' },
            amber: { border: '1px solid #fde68a', background: '#fffbeb', color: '#0f172a' },
            slate: { border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a' }
          }[colorTheme] || { border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a' };

          return (
            <div
              key={box.id || bIdx}
              onClick={() => onBoxClick && onBoxClick(box.id)}
              className={`${colSpan} rounded-xl p-3 shadow-2xs transition-all !text-slate-900 ${onBoxClick ? 'cursor-pointer hover:shadow-md' : ''}`}
              style={{ ...themeStyle, breakInside: 'avoid', pageBreakInside: 'avoid' }}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold truncate !text-slate-900" title={box.title}>
                  {box.title || `باکس محاسباتی ${bIdx + 1}`}
                </span>
                {box.unit && (
                  <span
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded !text-slate-800"
                    style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.1)' }}
                  >
                    {box.unit}
                  </span>
                )}
              </div>
              <div dir="ltr" className="text-left mt-1">
                {error ? (
                  <span className="text-[10px] font-mono !text-rose-700 font-bold block" title={error}>
                    خطا در فرمول
                  </span>
                ) : (
                  <span className="text-base sm:text-lg font-black font-mono tracking-tight block !text-slate-900">
                    {formatted}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PrintTemplateDesignerModal({
  isOpen,
  onClose,
  form,
  branding,
  onSave
}) {
  const { toast, confirm } = useDialog();
  // استخراج فیلدهای واقعی فرم از اسکیما (بدون سرصفحه‌های section / sectionContainer)
  const { formQuestions, sectionHeaderIds } = useMemo(() => {
    const list = [];
    const secIds = new Set();
    if (!form) return { formQuestions: list, sectionHeaderIds: secIds };
    try {
      const rawSchema = form.schemaJson || form.SchemaJSON;
      const s = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : (rawSchema || {});
      (s.sections || []).forEach((sec) => {
        (sec.questions || []).forEach((q) => {
          if (!q) return;
          if (q.type === 'section' || q.type === 'sectionContainer') {
            if (q.id) secIds.add(q.id);
            return;
          }
          list.push({
            id: q.id,
            label: q.label || 'فیلد بدون نام',
            type: q.type || 'text',
            unit: q.unit || '',
            columns: q.columns || []
          });
        });
      });
    } catch (e) {
      console.error('Error parsing form questions for print designer:', e);
    }
    return { formQuestions: list, sectionHeaderIds: secIds };
  }, [form]);

  // بارگذاری قالب‌های موجود فرم
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [previewWithSampleData, setPreviewWithSampleData] = useState(true);
  const [zoomScale, setZoomScale] = useState(0.85);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [selectedSectionFieldId, setSelectedSectionFieldId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('elements'); // 'elements' | 'settings'
  const [mobileViewMode, setMobileViewMode] = useState('canvas'); // 'canvas' | 'sidebar'
  const [isDirty, setIsDirty] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState(null);

  const formQuestionsMap = useMemo(() => new Map(formQuestions.map(q => [q.id, q])), [formQuestions]);

  // علامت‌گذاری باز بودن طراح قالب در کل برنامه جهت متوقف کردن رفرش‌های پس‌زمینه والد
  useEffect(() => {
    if (isOpen) {
      window.__bpms_print_designer_open = true;
      document.body.setAttribute('data-print-designer-open', 'true');
    } else {
      window.__bpms_print_designer_open = false;
      document.body.removeAttribute('data-print-designer-open');
    }
    return () => {
      window.__bpms_print_designer_open = false;
      document.body.removeAttribute('data-print-designer-open');
    };
  }, [isOpen]);

  // قفل مقداردهی اولیه قالب‌ها با useRef وابسته صرفاً به شناسه فرم
  // بدین ترتیب رندرهای والد به هیچ وجه تغییرات در حال انجام کاربر را ریست نمی‌کنند
  const initializedFormKeyRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !form) {
      initializedFormKeyRef.current = null;
      return;
    }
    const currentFormKey = String(form.id ?? form.formID ?? 'form_default');
    if (initializedFormKeyRef.current === currentFormKey) {
      return; // در این نشست طراحی قبلاً مقداردهی شده، هرگز استیت را ریست نکن
    }
    initializedFormKeyRef.current = currentFormKey;

    try {
      const rawSchema = form.schemaJson || form.SchemaJSON;
      const s = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : (rawSchema || {});
      let list = [];
      if (Array.isArray(s.printTemplates) && s.printTemplates.length > 0) {
        list = JSON.parse(JSON.stringify(s.printTemplates)).map(t => ({
          ...t,
          pageCount: Math.max(1, t.pageCount || 1, ...((t.blocks || []).map(b => b.page || 1))),
          repeatHeaderOnAllPages: t.repeatHeaderOnAllPages !== false,
          showImageAttachments: Boolean(t.showImageAttachments),
          calculatedBoxes: Array.isArray(t.calculatedBoxes) ? t.calculatedBoxes : [],
          footerPosition: t.footerPosition || 'lastPage',
          blocks: (t.blocks || []).map(normalizeBlock)
        }));
      } else {
        list = [createDefaultTemplate(form.title, formQuestions)];
      }
      setTemplates(list);
      setActiveTemplateId(list[0]?.id || null);
      setIsDirty(false);
      setSelectedBlockId(null);
      setSelectedSectionFieldId(null);
    } catch (e) {
      const fallback = [createDefaultTemplate(form.title, formQuestions)];
      setTemplates(fallback);
      setActiveTemplateId(fallback[0].id);
      setIsDirty(false);
      setSelectedBlockId(null);
      setSelectedSectionFieldId(null);
    }
  }, [isOpen, form?.id, form?.formID]);

  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === activeTemplateId) || templates[0] || null;
  }, [templates, activeTemplateId]);

  const selectedBlock = useMemo(() => {
    if (!activeTemplate?.blocks || !selectedBlockId) return null;
    return activeTemplate.blocks.find(b => b.id === selectedBlockId) || null;
  }, [activeTemplate, selectedBlockId]);

  // محاسبه تعداد کل صفحات بر اساس صفحه مشخص‌شده در قالب یا بلوک‌ها
  const totalPages = useMemo(() => {
    const explicitCount = activeTemplate?.pageCount || 1;
    const maxBlockPage = Math.max(1, ...(activeTemplate?.blocks || []).map(b => b.page || 1));
    return Math.max(1, explicitCount, maxBlockPage);
  }, [activeTemplate]);

  // شناسه فیلدهایی که در حال حاضر روی برگه قرار دارند (هم به صورت مجزا و هم درون کادرهای سکشن)
  const placedFieldIds = useMemo(() => {
    if (!activeTemplate?.blocks) return new Set();
    const set = new Set();
    activeTemplate.blocks.forEach(b => {
      if (b.type === 'field' && b.fieldId) {
        set.add(b.fieldId);
      }
      if ((b.type === 'sectionContainer' || b.type === 'sectionTitle') && Array.isArray(b.fieldIds)) {
        b.fieldIds.forEach(id => set.add(id));
      }
    });
    return set;
  }, [activeTemplate]);

  // به‌روزرسانی مشخصات قالب جاری با پشتیبانی از تابع به‌روزرسانی ایمن (جلوگیری از Stale Closure)
  const updateActiveTemplate = (updatesOrFn) => {
    if (!activeTemplate) return;
    const targetId = activeTemplate.id;
    setIsDirty(true);
    setTemplates(prev => prev.map(t => {
      if (t.id === targetId) {
        const patch = typeof updatesOrFn === 'function' ? updatesOrFn(t) : updatesOrFn;
        return { ...t, ...patch };
      }
      return t;
    }));
  };

  // داده‌های نمونه برای پیش‌نمایش زنده فرمول‌ها در طراح قالب
  const sampleAnswers = useMemo(() => {
    const map = {};
    formQuestions.forEach((q, idx) => {
      if (q.type === 'number') {
        const val = (idx + 1) * 100000;
        map[q.id] = val;
        map[q.label] = val;
      } else if (q.type === 'table' || q.type === 'repeater_grid') {
        const cols = Array.isArray(q.columns) ? q.columns : [];
        map[q.id] = [1, 2, 3].map(rowIdx => {
          const rowObj = {};
          cols.forEach((col, cIdx) => {
            if (col.type === 'number' || col.type === 'calculated' || col.includeInTotal) {
              rowObj[col.id] = (rowIdx * 1000) + (cIdx * 500);
              rowObj[col.label] = (rowIdx * 1000) + (cIdx * 500);
            } else {
              rowObj[col.id] = `قلم ${rowIdx}`;
              rowObj[col.label] = `قلم ${rowIdx}`;
            }
          });
          return rowObj;
        });
        map[q.label] = map[q.id];
      } else {
        map[q.id] = `نمونه ${q.label}`;
      }
    });
    return map;
  }, [formQuestions]);

  const { numericFields, tableColumns, tables } = useMemo(() => {
    return getNumericFieldsAndTables(formQuestions);
  }, [formQuestions]);

  const handleAddCalculatedBox = () => {
    const newBox = {
      id: 'calc_box_' + Date.now(),
      title: 'باکس محاسباتی جدید',
      formula: '',
      unit: 'ریال',
      decimals: 0,
      useGrouping: true,
      width: '1/3',
      color: 'blue'
    };
    updateActiveTemplate(t => ({
      calculatedBoxes: [...(t.calculatedBoxes || []), newBox]
    }));
    setSidebarTab('calc');
  };

  const handleUpdateCalculatedBox = (boxId, updates) => {
    updateActiveTemplate(t => ({
      calculatedBoxes: (t.calculatedBoxes || []).map(b => (b.id === boxId ? { ...b, ...updates } : b))
    }));
  };

  const handleDeleteCalculatedBox = (boxId) => {
    updateActiveTemplate(t => ({
      calculatedBoxes: (t.calculatedBoxes || []).filter(b => b.id !== boxId)
    }));
  };

  const handleMoveCalculatedBox = (boxId, direction) => {
    updateActiveTemplate(t => {
      const list = [...(t.calculatedBoxes || [])];
      const idx = list.findIndex(b => b.id === boxId);
      if (idx === -1) return {};
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= list.length) return {};
      const [moved] = list.splice(idx, 1);
      list.splice(targetIdx, 0, moved);
      return { calculatedBoxes: list };
    });
  };

  const handleInsertTokenToBox = (boxId, token) => {
    const inputEl = document.getElementById(`formula-input-${boxId}`);
    const box = (activeTemplate?.calculatedBoxes || []).find(b => b.id === boxId);
    if (!box) return;
    const current = box.formula || '';
    if (inputEl) {
      const start = inputEl.selectionStart ?? current.length;
      const end = inputEl.selectionEnd ?? current.length;
      const updated = current.substring(0, start) + token + current.substring(end);
      handleUpdateCalculatedBox(boxId, { formula: updated });
      setTimeout(() => {
        inputEl.focus();
        inputEl.setSelectionRange(start + token.length, start + token.length);
      }, 50);
    } else {
      handleUpdateCalculatedBox(boxId, { formula: current + token });
    }
  };

  // افزودن صفحه جدید به بوم چاپ
  const handleAddNewPage = () => {
    const newPageNum = totalPages + 1;
    updateActiveTemplate({ pageCount: newPageNum });
    setIsDirty(true);
  };

  // حذف صفحه از بوم چاپ
  const handleDeletePage = async (pageNum) => {
    if (totalPages <= 1) {
      toast.warning('حداقل باید یک صفحه در بوم چاپ وجود داشته باشد.');
      return;
    }
    const confirmed = await confirm({
      title: 'حذف برگه چاپ',
      message: `آیا از حذف برگه شماره ${pageNum} مطمئن هستید؟ تمام بلوک‌های این صفحه به صفحه قبلی منتقل خواهند شد.`,
      confirmText: 'تایید و حذف برگه',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }
    setIsDirty(true);
    const updatedBlocks = (activeTemplate.blocks || []).map(b => {
      if ((b.page || 1) === pageNum) {
        return { ...b, page: Math.max(1, pageNum - 1) };
      }
      if ((b.page || 1) > pageNum) {
        return { ...b, page: (b.page || 1) - 1 };
      }
      return b;
    });
    updateActiveTemplate({
      pageCount: totalPages - 1,
      blocks: updatedBlocks
    });
  };

  // افزودن قالب جدید
  const handleCreateNewTemplate = () => {
    setIsDirty(true);
    const newName = `قالب چاپ ${templates.length + 1}`;
    const newTpl = {
      id: 'tpl_' + Date.now(),
      name: newName,
      paperSize: 'A4',
      orientation: 'portrait',
      pageCount: 1,
      repeatHeaderOnAllPages: true,
      footerPosition: 'lastPage',
      margins: { top: 15, bottom: 15, left: 15, right: 15 },
      blocks: [
        {
          id: 'blk_header_' + Date.now(),
          type: 'header',
          zone: 'header',
          page: 1,
          showLogo: true,
          showTitle: true,
          showTrackingCode: true,
          showDate: true,
          colSpan: 2,
          showBorder: false,
          hasBorder: false
        }
      ]
    };
    setTemplates(prev => [...prev, newTpl]);
    setActiveTemplateId(newTpl.id);
  };

  // کپی کردن قالب فعال
  const handleDuplicateTemplate = () => {
    if (!activeTemplate) return;
    setIsDirty(true);
    const duplicated = {
      ...JSON.parse(JSON.stringify(activeTemplate)),
      id: 'tpl_' + Date.now(),
      name: `${activeTemplate.name} (کپی)`,
      blocks: (activeTemplate.blocks || []).map(b => ({
        ...b,
        id: b.type + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)
      }))
    };
    setTemplates(prev => [...prev, duplicated]);
    setActiveTemplateId(duplicated.id);
  };

  // حذف قالب فعال
  const handleDeleteTemplate = async () => {
    if (templates.length <= 1) {
      toast.warning('حداقل باید یک قالب چاپ برای فرم تعریف شده باشد.');
      return;
    }
    const confirmed = await confirm({
      title: 'حذف قالب چاپ',
      message: `آیا از حذف قالب «${activeTemplate.name}» مطمئن هستید؟`,
      confirmText: 'تایید و حذف قالب',
      variant: 'danger'
    });
    if (!confirmed) return;
    setIsDirty(true);
    const remaining = templates.filter(t => t.id !== activeTemplate.id);
    setTemplates(remaining);
    setActiveTemplateId(remaining[0].id);
  };

  // شروع تغییر نام قالب
  const startRename = () => {
    if (!activeTemplate) return;
    setRenamingId(activeTemplate.id);
    setRenameValue(activeTemplate.name);
  };

  // ذخیره نام جدید قالب
  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== activeTemplate.name) {
      setIsDirty(true);
      updateActiveTemplate({ name: renameValue.trim() });
    }
    setRenamingId(null);
  };

  // افزودن بلوک به برگه
  const handleAddBlock = (blockType, extra = {}, targetPage = 1) => {
    if (!activeTemplate) return;
    setIsDirty(true);
    let zone = 'body';
    if (blockType === 'header') zone = 'header';
    else if (blockType === 'signatures' || blockType === 'qrCode') zone = 'footer';
    else if (extra.zone) zone = extra.zone;

    const newBlock = {
      id: `blk_${blockType}_${Date.now()}`,
      type: blockType,
      zone: zone,
      page: targetPage,
      colSpan: (blockType === 'header' || blockType === 'signatures' || blockType === 'sectionContainer' || blockType === 'sectionTitle') ? 2 : 1,
      fontSize: 'normal',
      textAlign: 'right',
      padding: 'sm',
      showBorder: blockType !== 'header',
      hasBorder: blockType !== 'header',
      bgColor: 'default',
      ...extra
    };
    const updatedBlocks = [...(activeTemplate.blocks || []), newBlock];
    updateActiveTemplate({ blocks: updatedBlocks });
    setSelectedBlockId(newBlock.id);
    setSidebarTab('settings');
  };

  // حذف بلوک از برگه
  const handleDeleteBlock = (blockId) => {
    if (!activeTemplate) return;
    setIsDirty(true);
    const updatedBlocks = (activeTemplate.blocks || []).filter(b => b.id !== blockId);
    updateActiveTemplate({ blocks: updatedBlocks });
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
      setSelectedSectionFieldId(null);
      setSidebarTab('elements');
    }
  };

  // جابه‌جایی بلوک به بالا یا پایین در همان صفحه/ناحیه
  const handleMoveBlock = (blockId, direction) => {
    if (!activeTemplate) return;
    const list = [...activeTemplate.blocks];
    const index = list.findIndex(b => b.id === blockId);
    if (index === -1) return;
    const current = list[index];

    // یافتن بلوک هم‌صفحه و هم‌ناحیه قبل یا بعد
    const sameGroupIndices = list
      .map((b, idx) => ({ ...b, origIdx: idx }))
      .filter(b => (b.page || 1) === (current.page || 1) && (b.zone || 'body') === (current.zone || 'body'));

    const posInGroup = sameGroupIndices.findIndex(b => b.id === blockId);
    if (posInGroup === -1) return;

    const targetPosInGroup = direction === 'up' ? posInGroup - 1 : posInGroup + 1;
    if (targetPosInGroup < 0 || targetPosInGroup >= sameGroupIndices.length) return;

    const swapTargetOrigIdx = sameGroupIndices[targetPosInGroup].origIdx;
    setIsDirty(true);
    const temp = list[index];
    list[index] = list[swapTargetOrigIdx];
    list[swapTargetOrigIdx] = temp;
    updateActiveTemplate({ blocks: list });
  };

  // جابه‌جایی Drag & Drop با پشتیبانی از کادر سکشن
  const handleDropOnBlock = (targetBlockId) => {
    if (!draggedBlockId || draggedBlockId === targetBlockId) return;
    const list = [...(activeTemplate.blocks || [])];
    const dragIdx = list.findIndex(b => b.id === draggedBlockId);
    const targetIdx = list.findIndex(b => b.id === targetBlockId);
    if (dragIdx === -1 || targetIdx === -1) return;

    const dragged = { ...list[dragIdx] };
    const target = list[targetIdx];

    // اگر بلوک مقصد کادر سکشن باشد و بلوک درگ‌شده یک فیلد باشد، فیلد مستقیماً به داخل کادر سکشن منتقل شود
    if ((target.type === 'sectionContainer' || target.type === 'sectionTitle') && dragged.type === 'field' && dragged.fieldId) {
      const currentIds = target.fieldIds || [];
      if (!currentIds.includes(dragged.fieldId)) {
        list[targetIdx] = {
          ...target,
          fieldIds: [...currentIds, dragged.fieldId]
        };
        list.splice(dragIdx, 1);
        setIsDirty(true);
        updateActiveTemplate({ blocks: list });
        setDraggedBlockId(null);
        return;
      }
    }

    // به‌روزرسانی صفحه و ناحیه بلوک کشیده‌شده مطابق بلوک مقصد
    dragged.page = target.page || 1;
    if (dragged.type !== 'header' && target.zone) {
      dragged.zone = target.zone;
    }

    list.splice(dragIdx, 1);
    const newTargetIdx = list.findIndex(b => b.id === targetBlockId);
    list.splice(newTargetIdx, 0, dragged);

    setIsDirty(true);
    updateActiveTemplate({ blocks: list });
    setDraggedBlockId(null);
  };

  const handleDropOnZone = (page, zone) => {
    if (!draggedBlockId) return;
    const list = [...(activeTemplate.blocks || [])];
    const dragIdx = list.findIndex(b => b.id === draggedBlockId);
    if (dragIdx === -1) return;

    const dragged = { ...list[dragIdx], page: page };
    if (dragged.type !== 'header') {
      dragged.zone = zone;
    }
    list[dragIdx] = dragged;

    setIsDirty(true);
    updateActiveTemplate({ blocks: list });
    setDraggedBlockId(null);
  };

  // به‌روزرسانی مشخصات یک بلوک (با استفاده از به‌روزرسانی تابعی ایمن)
  const updateBlock = (blockId, patch) => {
    if (!activeTemplate) return;
    const safePatch = { ...patch };
    // اگر showBorder یا hasBorder تغییر کند، هر دو را همگام می‌کنیم
    if (safePatch.showBorder !== undefined) safePatch.hasBorder = safePatch.showBorder;
    if (safePatch.hasBorder !== undefined) safePatch.showBorder = safePatch.hasBorder;

    updateActiveTemplate(t => ({
      blocks: (t.blocks || []).map(b => {
        if (b.id === blockId) {
          return { ...b, ...safePatch };
        }
        return b;
      })
    }));
  };

  // بروزرسانی تنظیمات مستقل یک فیلد درون کادر سکشن (ایمن در برابر تغییرات سریع پیاپی)
  const updateSectionField = (sectionBlockId, fieldId, partial) => {
    if (!activeTemplate) return;
    updateActiveTemplate(t => ({
      blocks: (t.blocks || []).map(b => {
        if (b.id === sectionBlockId) {
          const prevSettings = b.fieldSettings || {};
          const curSetting = prevSettings[fieldId] || {};
          return {
            ...b,
            fieldSettings: {
              ...prevSettings,
              [fieldId]: { ...curSetting, ...partial }
            }
          };
        }
        return b;
      })
    }));
  };

  // جابه‌جایی فیلد درون کادر سکشن
  const handleMoveSectionField = (sectionBlockId, fieldId, direction) => {
    if (!activeTemplate) return;
    updateActiveTemplate(t => ({
      blocks: (t.blocks || []).map(b => {
        if (b.id === sectionBlockId) {
          const list = [...(b.fieldIds || [])];
          const idx = list.indexOf(fieldId);
          if (idx === -1) return b;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= list.length) return b;
          const temp = list[idx];
          list[idx] = list[targetIdx];
          list[targetIdx] = temp;
          return { ...b, fieldIds: list };
        }
        return b;
      })
    }));
  };

  // حذف فیلد از درون کادر سکشن
  const handleRemoveSectionField = (sectionBlockId, fieldId) => {
    if (!activeTemplate) return;
    updateActiveTemplate(t => ({
      blocks: (t.blocks || []).map(b => {
        if (b.id === sectionBlockId) {
          const nextIds = (b.fieldIds || []).filter(id => id !== fieldId);
          const nextSettings = { ...(b.fieldSettings || {}) };
          delete nextSettings[fieldId];
          return { ...b, fieldIds: nextIds, fieldSettings: nextSettings };
        }
        return b;
      })
    }));
    if (selectedSectionFieldId === fieldId) {
      setSelectedSectionFieldId(null);
    }
  };

  // ذخیره نهایی قالب‌ها در بک‌اند
  const handleSaveToBackend = async () => {
    if (!form) return;

    const emptyTemplate = templates.find(t => !t.blocks || t.blocks.length === 0);
    if (emptyTemplate) {
      toast.error(`قالب چاپ «${emptyTemplate.name}» هیچ بلوکی ندارد.\nلطفاً حداقل یک بلوک به برگه اضافه کنید یا این قالب را حذف نمایید.`, 6000);
      setActiveTemplateId(emptyTemplate.id);
      return;
    }

    setSaving(true);
    try {
      const targetId = form.formID || form.FormID;
      if (targetId && targetId > 0) {
        await api.put(`/forms/${targetId}/print-templates`, templates);
      }
      setIsDirty(false);
      if (onSave) {
        onSave(templates);
      }
      toast.success('قالب‌های چاپ فرم با موفقیت در سیستم ذخیره شدند.');
    } catch (err) {
      console.error(err);
      toast.error('خطا در ذخیره‌سازی قالب‌های چاپ: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleRequestClose = async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: 'تغییرات ذخیره‌نشده',
        message: 'تغییرات قالب چاپ ذخیره نشده‌اند. آیا از بستن پنجره مطمئن هستید؟',
        confirmText: 'بستن بدون ذخیره',
        cancelText: 'ادامه ویرایش',
        variant: 'warning'
      });
      if (!confirmed) {
        return;
      }
    }
    onClose();
  };

  // نمونه داده‌ها برای پیش‌نمایش در برگه
  const sampleData = {
    trackingCode: 'TRK-1403-89421',
    submittedAt: '2026-11-16T10:30:00Z',
    submittedByUserName: 'مهندس محمدرضا صادقی',
    signatures: [
      {
        stepName: 'ثبت و ارسال اولیه',
        userName: '[ثبت‌کننده درخواست]',
        actionAt: '۱۴۰۳/۰۸/۲۶ - ۱۰:۳۰',
        comment: 'درخواست به انضمام مستندات ضمیمه جهت بررسی ارسال شد.',
        status: 'approved'
      },
      {
        stepName: 'بررسی و تایید کارشناسی',
        userName: '[اقدام‌کننده مرحله ۱]',
        actionAt: '۱۴۰۳/۰۸/۲۶ - ۱۱:۱۵',
        comment: 'با رعایت ضوابط ابلاغی مورد موافقت قرار گرفت.',
        status: 'approved'
      },
      {
        stepName: 'تصویب نهایی مدیریت',
        userName: '[اقدام‌کننده مرحله ۲]',
        actionAt: '۱۴۰۳/۰۸/۲۶ - ۱۳:۰۰',
        comment: 'اقدام لازم مطابق بخشنامه انجام پذیرد.',
        status: 'approved'
      }
    ]
  };

  // تابع جامع و ایمن تولید مقادیر نمونه برای پیش‌نمایش در بوم و کادرهای سکشن
  const getSampleValue = (fieldOrType) => {
    if (!fieldOrType) return '—';

    const type = typeof fieldOrType === 'string' ? fieldOrType : (fieldOrType.type || 'text');
    const label = typeof fieldOrType === 'object' ? (fieldOrType.label || fieldOrType.title || '') : '';
    const unit = typeof fieldOrType === 'object' ? (fieldOrType.unit || '') : '';
    const l = (label || '').toLowerCase();

    // بررسی بر اساس برچسب فیلد (در صورت وجود شیء فیلد)
    if (l.includes('نام و نام خانوادگی') || (l.includes('نام') && !l.includes('نامه') && !l.includes('نام نویسی'))) return 'محمدحسین رضایی';
    if (l.includes('کد ملی') || l.includes('کدملی')) return '۰۰۱۲۳۴۵۶۷۸';
    if (l.includes('ایمیل') || l.includes('رایانامه')) return 'user@example.com';
    if (l.includes('تلفن') || l.includes('موبایل') || l.includes('شماره تماس')) return '۰۹۱۲۳۴۵۶۷۸۹';
    if (l.includes('آدرس') || l.includes('نشانی')) return 'تهران، خیابان ولیعصر، پلاک ۱۲۳، واحد ۴';
    if (l.includes('مبلغ') || l.includes('قیمت') || l.includes('هزینه')) return unit ? `۱۲,۵۰۰,۰۰۰ ${unit}` : '۱۲,۵۰۰,۰۰۰ ریال';
    if (l.includes('کد پستی') || l.includes('کدپستی')) return '۱۹۳۹۵۴۳۲۱۱';
    if (l.includes('سمت') || l.includes('عنوان شغل')) return 'مدیر امور فناوری اطلاعات';
    if (l.includes('واحد') || l.includes('دپارتمان') || l.includes('بخش')) return 'واحد تحقیق و توسعه';

    // بررسی بر اساس نوع فیلد (Field Type)
    switch (type) {
      case 'number':
      case 'currency':
      case 'price':
        return unit ? `۱۲,۵۰۰,۰۰۰ ${unit}` : '۱۲,۵۰۰,۰۰۰';
      case 'date':
      case 'jalali':
      case 'datetime':
      case 'date-jalali':
        return '۱۴۰۳/۰۸/۲۶';
      case 'time':
        return '۱۰:۳۰';
      case 'textarea':
      case 'paragraph':
        return 'توضیحات و شرح مفصل مربوط به این درخواست سازمانی جهت درج در گزارش رسمی اداری.';
      case 'select':
      case 'dropdown':
        return 'گزینه انتخابی نمونه';
      case 'radio':
        return 'گزینه الف (تایید شده)';
      case 'checkbox':
        return '☑ تایید شده / بله';
      case 'multiselect':
        return 'مورد ۱، مورد ۲';
      case 'table':
        return '[جدول اقلام چندسطری]';
      case 'file':
      case 'upload':
      case 'attachment':
        return 'document_scan.pdf (ضمیمه)';
      case 'signature':
        return 'امضای دیجیتال ثبت‌شده';
      case 'rating':
        return '★★★★★ (۵ از ۵)';
      case 'text':
      default:
        if (label) return `داده نمونه برای ${label}`;
        return 'نمونه متن کوتاه اداری';
    }
  };

  const getSampleFieldValue = (q) => getSampleValue(q);

  // محاسبه ابعاد برگه جهت نمایش متناسب
  const curPaperSize = activeTemplate?.paperSize || 'A4';
  const curOrientation = activeTemplate?.orientation || 'portrait';
  const sheetMm = (PAPER_DIMENSIONS[curPaperSize] && PAPER_DIMENSIONS[curPaperSize][curOrientation])
    ? PAPER_DIMENSIONS[curPaperSize][curOrientation]
    : PAPER_DIMENSIONS.A4.portrait;

  const basePxWidth = (sheetMm?.width || 210) * 3.78;
  const basePxHeight = (sheetMm?.height || 297) * 3.78;

  const {
    wrapperRef: canvasWrapperRef,
    contentRef: canvasContentRef,
    isMobile: isMobileViewport,
    effectiveScale,
    scaledWidth,
    scaledHeight
  } = useResponsiveSheetScale(
    basePxWidth,
    basePxHeight,
    zoomScale,
    totalPages,
    isOpen && Boolean(form),
    `${mobileViewMode}-${activeTemplateId || ''}-${curPaperSize}-${curOrientation}-${totalPages}-${(activeTemplate?.blocks || []).length}`
  );

  const getPaddingClass = (p) => {
    if (p === 'lg') return 'p-4';
    if (p === 'md') return 'p-3';
    return 'p-1.5';
  };

  // استخراج بلوک رسمی سربرگ
  const headerBlock = (activeTemplate?.blocks || []).find(b => b.type === 'header') || null;

  // تابع مشترک و جامع رندر محتوای انواع بلوک‌ها با تضمین خوانایی خودکار (Auto-Contrast)
  const renderBlockContent = (block) => {
    const isDark = isDarkColor(block.bgColor);
    const titleColor = isDark ? 'text-white' : '!text-slate-900';
    const labelColor = isDark ? 'text-slate-200' : '!text-slate-700';
    const valColor = isDark ? 'text-slate-100' : '!text-slate-900';
    const descColor = isDark ? 'text-slate-200' : '!text-slate-600';

    // ۱. سربرگ رسمی (Header)
    if (block.type === 'header') {
      return (
        <div className="pb-3 border-b-2 border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {block.showLogo !== false && (
                <img
                  src={branding?.logoUrl || '/branding/Logo.png'}
                  alt="Logo"
                  className="h-12 w-auto max-w-[100px] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              )}
              <div>
                <span className={`text-[11px] font-bold ${labelColor} block`}>
                  {branding?.systemTitle || 'جمهوری اسلامی ایران'}
                </span>
                <span className={`text-xs ${descColor}`}>سامانه الکترونیک فرم‌ها و فرآیندها</span>
              </div>
            </div>

            <div className="text-center px-4">
              <h2 className={`text-base font-extrabold ${titleColor}`}>
                {form?.title || 'عنوان فرم'}
              </h2>
              <span className={`text-[10px] ${descColor} font-medium`}>
                {activeTemplate?.name || 'قالب چاپ'}
              </span>
            </div>

            <div className={`text-left text-[10px] ${labelColor} font-mono space-y-0.5`}>
              {block.showTrackingCode !== false && (
                <div>
                  <span>کد رهگیری: </span>
                  <b className={`font-bold ${titleColor}`}>{sampleData.trackingCode}</b>
                </div>
              )}
              {block.showDate !== false && (
                <div>
                  <span>تاریخ: </span>
                  <b className={titleColor}>۱۴۰۳/۰۸/۲۶</b>
                </div>
              )}
              <div>
                <span>پیوست: </span>
                <b className={titleColor}>دارد</b>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const bFontSizePx = getFontSizePx(block.fontSize);
    const bTextAlign = normalizeTextAlign(block.textAlign);

    // ۲. کادر سکشن واقعی (Section Container) با شبکه ۱۲ ستونه و انتخاب مستقل فیلدها
    if (block.type === 'sectionContainer' || block.type === 'sectionTitle') {
      return (
        <div
          className="space-y-3 p-1 rounded-lg"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const raw = e.dataTransfer.getData('text/plain');
              const data = JSON.parse(raw);
              if (data.fieldId) {
                const cur = block.fieldIds || [];
                if (!cur.includes(data.fieldId)) {
                  updateBlock(block.id, { fieldIds: [...cur, data.fieldId] });
                }
              }
            } catch {}
          }}
        >
          {/* هدر کادر سکشن */}
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-dashed border-slate-300">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-6 h-6 rounded-lg ${isDark ? 'bg-slate-700 text-sky-300 border border-slate-600' : 'bg-blue-50 text-blue-600 border border-blue-200'} flex items-center justify-center shrink-0`}>
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0" style={{ textAlign: bTextAlign }}>
                <h4
                  className={`font-bold ${titleColor} block w-full`}
                  style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
                >
                  {block.title || 'کادر سکشن'}
                </h4>
                {block.description && (
                  <p
                    className={`${descColor} mt-0.5 block w-full`}
                    style={{ fontSize: `${Math.max(10, bFontSizePx - 2)}px`, textAlign: bTextAlign }}
                  >
                    {block.description}
                  </p>
                )}
              </div>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border shrink-0 ${isDark ? 'bg-slate-800 text-sky-300 border-slate-700' : '!bg-slate-100 !text-slate-800 border-slate-300'}`}>
              {block.borderStyle === 'solid' ? 'کادر ممتد' : block.borderStyle === 'none' ? 'بدون کادر' : 'کادر نقطه‌چین'}
            </span>
          </div>

          {/* فیلدهای داخل این کادر در شبکه ۱۲ ستونه */}
          {(!block.fieldIds || block.fieldIds.length === 0) ? (
            <div className={`p-4 border-2 border-dashed ${isDark ? 'border-slate-700 bg-slate-800/40 text-slate-300' : 'border-slate-300 bg-slate-100/50 !text-slate-700'} rounded-xl text-center`}>
              <p className="text-[11px]">
                فیلدی در این کادر قرار ندارد. از پنل سایدبار با کشیدن و رها کردن (Drag & Drop) فیلدها را به این کادر منتقل کنید.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-2.5">
              {block.fieldIds.map((fId, fIdx) => {
                const q = formQuestionsMap.get(fId);
                if (!q) return null;
                const fConfig = (block.fieldSettings && block.fieldSettings[fId]) || {};
                const isFieldSelected = (selectedBlockId === block.id && selectedSectionFieldId === fId);

                // محاسبه عرض ستون بر اساس ۱۲ ستون: تمام‌عرض 12، نیم‌عرض 6، یک‌سوم 4
                const curColSpan = fConfig.colSpan || (q.type === 'table' || q.type === 'repeater_grid' ? 12 : 6);
                const colSpanClass = curColSpan === 12
                  ? 'col-span-12'
                  : curColSpan === 4
                  ? 'col-span-4'
                  : 'col-span-6';

                const fPadding = getPaddingClass(fConfig.padding || 'sm');
                const fShowBorder = fConfig.showBorder !== undefined ? fConfig.showBorder : true;
                const fHasCustomDark = isDarkColor(fConfig.bgColor);
                const fIsDark = fHasCustomDark || isDark;

                const fLabelColor = fIsDark ? 'text-slate-200' : '!text-slate-700';
                const fValColor = fIsDark ? 'text-slate-100' : '!text-slate-900';
                const fBgStyle = (fConfig.bgColor && fConfig.bgColor !== 'transparent' && fConfig.bgColor !== 'default')
                  ? fConfig.bgColor
                  : (fHasCustomDark ? '#1e293b' : (isDark ? 'rgba(255,255,255,0.06)' : 'transparent'));

                const isTable = q.type === 'table' || q.type === 'repeater_grid';
                const currentLabel = fConfig.customLabel !== undefined ? fConfig.customLabel : (q.label || 'فیلد');
                const showLabel = fConfig.showLabel !== false;
                const fFontSizePx = getFontSizePx(fConfig.fontSize || block.fontSize);
                const fTextAlign = normalizeTextAlign(fConfig.textAlign || block.textAlign);

                return (
                  <div
                    key={fId}
                    className={`${colSpanClass} relative group/field rounded-lg transition cursor-pointer select-none ${
                      isFieldSelected
                        ? 'ring-2 ring-blue-500 border-2 border-blue-500 shadow-md'
                        : fShowBorder
                        ? 'border border-slate-300 hover:border-blue-400'
                        : 'border border-transparent hover:border-slate-300'
                    } ${fPadding}`}
                    style={{
                      backgroundColor: fBgStyle
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedBlockId(block.id);
                      setSelectedSectionFieldId(fId);
                      setSidebarTab('settings');
                    }}
                  >
                    {/* نوار ابزار سریع بالای فیلد داخلی */}
                    <div
                      data-designer-toolbar="true"
                      className={`absolute -top-3.5 left-1.5 z-20 flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-md text-[10px] ${
                        isFieldSelected ? 'opacity-100' : 'opacity-0 group-hover/field:opacity-100'
                      } transition-opacity`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => updateSectionField(block.id, fId, { colSpan: 12 })}
                        className={`px-1 rounded ${curColSpan === 12 ? 'bg-blue-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                        title="تمام‌عرض (1/1)"
                      >
                        1/1
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSectionField(block.id, fId, { colSpan: 6 })}
                        className={`px-1 rounded ${curColSpan === 6 ? 'bg-blue-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                        title="نیم‌عرض (1/2)"
                      >
                        1/2
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSectionField(block.id, fId, { colSpan: 4 })}
                        className={`px-1 rounded ${curColSpan === 4 ? 'bg-blue-600 text-white font-bold' : 'text-slate-300 hover:text-white'}`}
                        title="یک‌سوم (1/3)"
                      >
                        1/3
                      </button>
                      <div className="w-px h-3 bg-slate-700 mx-0.5" />
                      <button
                        type="button"
                        onClick={() => handleMoveSectionField(block.id, fId, 'up')}
                        disabled={fIdx === 0}
                        className="p-0.5 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
                        title="حرکت به قبل"
                      >
                        <MoveUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSectionField(block.id, fId, 'down')}
                        disabled={fIdx === block.fieldIds.length - 1}
                        className="p-0.5 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
                        title="حرکت به بعد"
                      >
                        <MoveDown className="w-3 h-3" />
                      </button>
                      <div className="w-px h-3 bg-slate-700 mx-0.5" />
                      <button
                        type="button"
                        onClick={() => handleRemoveSectionField(block.id, fId)}
                        className="p-0.5 text-rose-400 hover:text-rose-200 cursor-pointer"
                        title="حذف از این کادر"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* محتوای فیلد داخلی */}
                    <div className="space-y-1">
                      {showLabel && (
                        <div className="w-full" style={{ textAlign: fTextAlign }}>
                          <span
                            className={`font-semibold ${fLabelColor} block truncate w-full`}
                            style={{ fontSize: `${fFontSizePx}px`, textAlign: fTextAlign }}
                          >
                            {currentLabel}:
                          </span>
                        </div>
                      )}
                      {isTable ? (
                        <div
                          className={`p-1.5 rounded border border-dashed ${
                            fIsDark ? 'text-slate-200 bg-slate-800/60 border-slate-700' : '!text-slate-700 bg-transparent border-slate-300'
                          }`}
                          style={{ fontSize: `${Math.max(10, fFontSizePx - 1)}px`, textAlign: fTextAlign }}
                        >
                          [جدول اقلام چندسطری - {(q.columns || []).length} ستون]
                        </div>
                      ) : (
                        <div
                          className={`min-h-[26px] py-1 px-2 rounded border font-medium break-words w-full block ${
                            fIsDark
                              ? 'bg-slate-800/80 border-slate-700 text-slate-100'
                              : 'bg-transparent border-slate-300 !text-slate-900'
                          }`}
                          style={{ fontSize: `${fFontSizePx}px`, textAlign: fTextAlign }}
                        >
                          {previewWithSampleData ? getSampleValue(q) : '—'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // ۳. فیلد مجزای فرم (Field)
    if (block.type === 'field') {
      if (sectionHeaderIds.has(block.fieldId)) return null;
      const question = formQuestionsMap.get(block.fieldId);
      if (!question) {
        return (
          <div className="p-2.5 rounded-lg border-2 border-dashed border-rose-400 bg-rose-50/80 text-rose-800 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-rose-700">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>فیلد حذف‌شده ({block.label || block.fieldId})</span>
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteBlock(block.id);
                }}
                className="p-1 text-rose-700 hover:text-white hover:bg-rose-600 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      }

      const currentLabel = block.customLabel || question.label || block.label;
      const isTable = question.type === 'table' || question.type === 'repeater_grid';

      if (isTable) {
        const cols = (question.columns && question.columns.length > 0)
          ? question.columns
          : [
              { id: 'c1', title: 'شرح کالا / خدمات' },
              { id: 'c2', title: 'تعداد / مقدار' },
              { id: 'c3', title: 'مبلغ واحد (ریال)' }
            ];

        return (
          <div className="space-y-1.5">
            {block.showLabel && (
              <span
                className={`font-bold ${titleColor} block w-full`}
                style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
              >
                {currentLabel}:
              </span>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-right text-[10px]">
                <thead>
                  <tr className={`${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 !text-slate-900'} font-bold border-b border-slate-300`}>
                    <th className="border border-slate-300 p-1.5 w-8 text-center">#</th>
                    {cols.map((col, cIdx) => (
                      <th key={col.id || cIdx} className="border border-slate-300 p-1.5">
                        {col.title || col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="border border-slate-300 p-1.5 text-center font-mono">۱</td>
                    {cols.map((col, cIdx) => (
                      <td key={col.id || cIdx} className={`border border-slate-300 p-1.5 ${valColor}`}>
                        {cIdx === 0 ? 'مورد نمونه ۱' : cIdx === 1 ? '۵' : '۱,۲۰۰,۰۰۰'}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="border border-slate-300 p-1.5 text-center font-mono">۲</td>
                    {cols.map((col, cIdx) => (
                      <td key={col.id || cIdx} className={`border border-slate-300 p-1.5 ${valColor}`}>
                        {cIdx === 0 ? 'مورد نمونه ۲' : cIdx === 1 ? '۲' : '۸۵۰,۰۰۰'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      return (
        <div className="w-full">
          {block.showLabel && (
            <span
              className={`font-bold ${labelColor} block mb-0.5 w-full`}
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
            >
              {currentLabel}:
            </span>
          )}
          <div
            className={`font-medium ${valColor} w-full block`}
            style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
          >
            {previewWithSampleData
              ? getSampleValue(question)
              : `[مقدار فیلد ${currentLabel}]`}
          </div>
        </div>
      );
    }

    // ۴. متن ثابت (Static Text)
    if (block.type === 'staticText') {
      const isSelected = selectedBlockId === block.id;
      return (
        <div className="w-full">
          {isSelected ? (
            <textarea
              value={block.content || ''}
              onChange={(e) => updateBlock(block.id, { content: e.target.value })}
              className="w-full p-1.5 border border-blue-300 rounded bg-white text-slate-900 focus:outline-none"
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
              rows={2}
            />
          ) : (
            <p
              className={`${valColor} leading-relaxed w-full block`}
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
            >
              {block.content || 'متن ثابت دلخواه طراح فرم...'}
            </p>
          )}
        </div>
      );
    }

    // ۵. جدول تاییدات و گردش‌کار (Signatures)
    if (block.type === 'signatures') {
      return (
        <div className="space-y-1.5">
          <span
            className={`font-bold ${titleColor} block w-full`}
            style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
          >
            {block.title || 'جدول تاییدات و گردش‌کار'}
          </span>
          <table className="w-full border-collapse border border-slate-300 text-right text-[10px]">
            <thead>
              <tr className={`${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 !text-slate-900'} font-bold border-b border-slate-300`}>
                <th className="border border-slate-300 p-1.5 w-8 text-center">#</th>
                <th className="border border-slate-300 p-1.5">مرحله / اقدام</th>
                <th className="border border-slate-300 p-1.5">نام و سمت اقدام‌کننده</th>
                <th className="border border-slate-300 p-1.5">تاریخ و ساعت</th>
                {block.showComments && (
                  <th className="border border-slate-300 p-1.5">توضیحات و هامش</th>
                )}
                <th className="border border-slate-300 p-1.5 w-24 text-center">وضعیت اقدام</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.signatures.map((sig, sIdx) => (
                <tr key={sIdx} className="border-b border-slate-200">
                  <td className="border border-slate-300 p-1.5 text-center font-mono">{sIdx + 1}</td>
                  <td className={`border border-slate-300 p-1.5 font-bold ${titleColor}`}>{sig.stepName}</td>
                  <td className={`border border-slate-300 p-1.5 font-medium ${valColor}`}>{sig.userName}</td>
                  <td className={`border border-slate-300 p-1.5 font-mono text-[9px] ${labelColor}`}>{sig.actionAt}</td>
                  {block.showComments && (
                    <td className={`border border-slate-300 p-1.5 ${labelColor}`}>{sig.comment}</td>
                  )}
                  <td className="border border-slate-300 p-1 text-center bg-slate-50/50">
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      ✓ تایید شده
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ۶. بارکد اعتبارسنجی (QR Code)
    if (block.type === 'qrCode') {
      return (
        <div className="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-200 !text-slate-900">
          <div className="bg-white p-1 rounded border border-slate-200 shrink-0">
            <QRCodeSVG
              value={`https://bpms.local/verify/${sampleData.trackingCode}`}
              size={48}
              level="M"
            />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5" style={{ textAlign: bTextAlign }}>
            <span
              className={`font-bold ${titleColor} block w-full`}
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
            >
              {block.title || 'اعتبارسنجی سند الکترونیکی'}
            </span>
            <span className="text-[10px] !text-slate-600 block">
              جهت استعلام اصالت این برگه، بارکد فوق را اسکن نمایید.
            </span>
            <span className="font-mono text-[9px] !text-slate-700 block">
              {sampleData.trackingCode}
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  // تابع مشترک رندر کادر بلوک در بوم برگه همراه با نوار ابزار و قابلیت جابه‌جایی
  const renderCanvasBlock = (block, bIdx, totalInZone, zoneName) => {
    const isSelected = selectedBlockId === block.id && !selectedSectionFieldId;
    const isSec = block.type === 'sectionContainer' || block.type === 'sectionTitle';
    const widthClass = (block.colSpan === 2 || isSec)
      ? 'w-full'
      : block.colSpan === 3
      ? 'w-1/3'
      : 'w-1/2';

    const showBorder = block.showBorder !== false && block.hasBorder !== false;
    const isDark = isDarkColor(block.bgColor);
    const borderColor = showBorder ? (isDark ? '#334155' : (block.borderStyle === 'dashed' || isSec ? '#94a3b8' : '#cbd5e1')) : 'transparent';
    const borderStyle = showBorder ? (block.borderStyle || (isSec ? 'dashed' : 'solid')) : 'none';
    const borderWidth = showBorder ? ((block.borderStyle === 'dashed' || isSec) ? '2px' : '1px') : '0px';
    const backgroundColor = (block.bgColor && block.bgColor !== 'transparent' && block.bgColor !== 'default')
      ? block.bgColor
      : undefined;

    return (
      <div
        key={block.id}
        className={`${widthClass} px-1.5 transition-all group/item`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', block.id);
          setDraggedBlockId(block.id);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDropOnBlock(block.id);
        }}
        onClick={() => {
          setSelectedBlockId(block.id);
          setSelectedSectionFieldId(null);
          setSidebarTab('settings');
        }}
      >
        <div
          className={`relative rounded-lg ${getPaddingClass(block.padding)} transition ${
            isSelected
              ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/10'
              : showBorder
              ? 'border hover:border-blue-300'
              : 'border border-transparent hover:border-slate-300/40'
          }`}
          style={{
            borderStyle,
            borderWidth,
            borderColor,
            backgroundColor
          }}
        >
          {/* نوار کنترل ابزار روی خود بلوک */}
          <div
            data-designer-toolbar="true"
            className={`absolute -top-3 left-2 z-20 flex items-center gap-1 bg-slate-900 text-white px-2 py-0.5 rounded-lg shadow-md text-[10px] ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
            } transition-opacity`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cursor-grab text-slate-400 hover:text-white p-0.5" title="برای جابه‌جایی Drag کنید">
              <GripVertical className="w-3 h-3" />
            </div>

            <button
              type="button"
              onClick={() => handleMoveBlock(block.id, 'up')}
              disabled={bIdx === 0}
              className="p-1 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
              title="حرکت به بالا"
            >
              <MoveUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleMoveBlock(block.id, 'down')}
              disabled={bIdx === totalInZone - 1}
              className="p-1 hover:text-blue-400 disabled:opacity-30 cursor-pointer"
              title="حرکت به پایین"
            >
              <MoveDown className="w-3 h-3" />
            </button>

            <span className="w-px h-2.5 bg-slate-700" />

            <button
              type="button"
              onClick={() => updateBlock(block.id, { colSpan: 2 })}
              className={`px-1 rounded ${block.colSpan === 2 ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              title="تمام‌عرض (۱/۱)"
            >
              تمام
            </button>
            <button
              type="button"
              onClick={() => updateBlock(block.id, { colSpan: 1 })}
              className={`px-1 rounded ${block.colSpan === 1 ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
              title="نیم‌عرض (۱/۲)"
            >
              ۱/۲
            </button>

            <span className="w-px h-2.5 bg-slate-700" />

            <button
              type="button"
              onClick={() => updateBlock(block.id, { showBorder: !showBorder, hasBorder: !showBorder })}
              className={`px-1 rounded ${showBorder ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}
              title="کادر دور"
            >
              کادر
            </button>

            <span className="w-px h-2.5 bg-slate-700" />

            <button
              type="button"
              onClick={() => handleDeleteBlock(block.id)}
              className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
              title="حذف این بلوک"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          {/* محتوای رندرشده بلوک */}
          {renderBlockContent(block)}
        </div>
      </div>
    );
  };

  if (!isOpen || !form) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
      {/* ۱. نوار ابزار اصلی بالای صفحه (ریسپانسیو در موبایل با flex-wrap و فشرده در دسکتاپ) */}
      <div className="bg-slate-900 text-white border-b border-slate-700/80 px-2 py-2 sm:px-1.5 sm:py-1.5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 lg:gap-1 shrink-0 shadow-md">
        <div className="w-full lg:w-auto flex-1 min-w-0 flex flex-wrap lg:flex-nowrap items-center gap-1.5 lg:gap-1 lg:overflow-x-auto">
          {/* راست: عنوان و انتخابگر قالب */}
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-1 w-full sm:w-auto shrink-0">
            <div className="flex items-center gap-1 shrink-0">
              <div
                className="w-6 h-6 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0"
                title={`طراح قالب چاپ — فرم: ${form.title}`}
              >
                <Printer className="w-3.5 h-3.5" />
              </div>
              <div className="sm:hidden xl:block leading-tight">
                <span className="text-[11px] font-bold block text-slate-100 whitespace-nowrap">طراح قالب چاپ</span>
                <span className="hidden 2xl:block text-[10px] text-slate-400 max-w-[120px] truncate">فرم: {form.title}</span>
              </div>
            </div>

            <div className="h-4 w-px bg-slate-700 mx-0.5 hidden xl:block" />

            {/* منوی انتخاب قالب */}
            <div className="flex flex-wrap items-center gap-1 flex-1 sm:flex-initial min-w-0">
              {renamingId === activeTemplate?.id ? (
                <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-0">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="px-2 py-1 sm:py-0.5 rounded-lg bg-slate-800 text-white text-[11px] flex-1 sm:flex-initial min-w-0 w-28 xl:w-32 border border-blue-500 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={commitRename}
                    className="p-1 text-emerald-400 hover:text-emerald-300 shrink-0"
                    title="تایید تغییر نام"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 flex-1 sm:flex-initial min-w-0">
                  <select
                    value={activeTemplateId || ''}
                    onChange={(e) => setActiveTemplateId(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-[11px] rounded-lg px-2 py-1 font-medium min-w-0 flex-1 sm:flex-initial sm:min-w-[140px] max-w-full sm:max-w-[165px] xl:max-w-[215px] 2xl:max-w-[260px] truncate focus:outline-none focus:ring-1 focus:ring-blue-500"
                    title={activeTemplate?.name || 'انتخاب قالب'}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.paperSize} {t.orientation === 'portrait' ? 'عمودی' : 'افقی'})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={startRename}
                    className="flex items-center gap-1 p-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition text-[11px] cursor-pointer shrink-0"
                    title="تغییر نام قالب"
                  >
                    <PenTool className="w-3 h-3 shrink-0" />
                    <span className="hidden 2xl:inline">ویرایش نام</span>
                  </button>
                </div>
              )}

              {/* دکمه‌های مدیریت قالب */}
              <button
                type="button"
                onClick={handleCreateNewTemplate}
                className="flex items-center gap-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 text-[11px] px-1.5 py-1 rounded-lg border border-blue-500/30 font-medium transition cursor-pointer whitespace-nowrap shrink-0"
                title="ایجاد یک قالب چاپ جدید برای این فرم"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span className="hidden xl:inline">قالب </span>
                <span>جدید</span>
              </button>

              <button
                type="button"
                onClick={handleDuplicateTemplate}
                className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
                title="ایجاد کپی از این قالب"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>

              {templates.length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteTemplate}
                  className="p-1 text-rose-400 hover:text-rose-300 rounded-lg hover:bg-slate-800 transition cursor-pointer shrink-0"
                  title="حذف این قالب چاپ"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* مرکز: تنظیمات سایز، جهت و معماری سربرگ/پاورقی */}
          <div className="flex flex-wrap items-center gap-1 w-full sm:w-auto shrink-0">
            {/* قطع برگه */}
            <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => updateActiveTemplate({ paperSize: 'A4' })}
                className={`px-1.5 py-0.5 rounded-md font-bold transition cursor-pointer ${
                  activeTemplate?.paperSize === 'A4'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                A4
              </button>
              <button
                type="button"
                onClick={() => updateActiveTemplate({ paperSize: 'A5' })}
                className={`px-1.5 py-0.5 rounded-md font-bold transition cursor-pointer ${
                  activeTemplate?.paperSize === 'A5'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                A5
              </button>
            </div>

            {/* جهت برگه */}
            <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 text-[11px]">
              <button
                type="button"
                onClick={() => updateActiveTemplate({ orientation: 'portrait' })}
                className={`px-1.5 py-0.5 rounded-md font-medium transition cursor-pointer ${
                  activeTemplate?.orientation === 'portrait'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                عمودی
              </button>
              <button
                type="button"
                onClick={() => updateActiveTemplate({ orientation: 'landscape' })}
                className={`px-1.5 py-0.5 rounded-md font-medium transition cursor-pointer ${
                  activeTemplate?.orientation === 'landscape'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                افقی
              </button>
            </div>

            {/* سوییچ معماری: تکرار خودکار سربرگ در بالای تمام صفحات */}
            <button
              type="button"
              onClick={() => updateActiveTemplate({ repeatHeaderOnAllPages: !(activeTemplate?.repeatHeaderOnAllPages !== false) })}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer whitespace-nowrap ${
                activeTemplate?.repeatHeaderOnAllPages !== false
                  ? 'bg-blue-900/60 border-blue-500/50 text-blue-200'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="با فعال بودن این گزینه، سربرگ رسمی با لوگو در بالای صفحه ۱، صفحه ۲ و تمامی صفحات بعدی تکرار می‌شود"
            >
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="hidden 2xl:inline">تکرار خودکار </span>
              <span>سربرگ:</span>
              <span className="font-bold">{activeTemplate?.repeatHeaderOnAllPages !== false ? 'فعال' : 'غیرفعال'}</span>
            </button>

            {/* سوییچ معماری: محل نمایش تاییدات و پاورقی */}
            <div className="flex items-center bg-slate-800/90 rounded-lg p-0.5 border border-slate-700 text-[10px]">
              <button
                type="button"
                onClick={() => updateActiveTemplate({ footerPosition: 'lastPage' })}
                className={`px-1.5 py-0.5 rounded-md font-medium transition cursor-pointer whitespace-nowrap ${
                  activeTemplate?.footerPosition !== 'allPages'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="تاییدات و پاورقی فقط در صفحه آخر نمایش داده می‌شوند"
              >
                پاورقی: <span className="hidden xl:inline">صفحه </span>آخر
              </button>
              <button
                type="button"
                onClick={() => updateActiveTemplate({ footerPosition: 'allPages' })}
                className={`px-1.5 py-0.5 rounded-md font-medium transition cursor-pointer whitespace-nowrap ${
                  activeTemplate?.footerPosition === 'allPages'
                    ? 'bg-blue-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="تاییدات و پاورقی در انتهای تمام صفحات تکرار می‌شوند"
              >
                <span className="hidden xl:inline">تمام صفحات</span>
                <span className="xl:hidden">همه</span>
              </button>
            </div>

            {/* سوییچ معماری: نمایش تصاویر پیوست در انتهای برگه چاپی PDF */}
            <button
              type="button"
              onClick={() => updateActiveTemplate({ showImageAttachments: !Boolean(activeTemplate?.showImageAttachments) })}
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer whitespace-nowrap ${
                Boolean(activeTemplate?.showImageAttachments)
                  ? 'bg-purple-900/60 border-purple-500/50 text-purple-200'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="نمایش تصاویر پیوست‌شده در انتهای برگه چاپی PDF (پیش‌فرض غیرفعال)"
            >
              <ImageIcon className="w-3 h-3 shrink-0" />
              <span className="hidden 2xl:inline">نمایش </span>
              <span>تصاویر<span className="hidden xl:inline"> PDF</span>:</span>
              <span className="font-bold">{Boolean(activeTemplate?.showImageAttachments) ? 'فعال' : 'غیرفعال'}</span>
            </button>

            {/* زوم بوم */}
            <div className="hidden lg:flex items-center gap-0.5 bg-slate-800/90 px-1 py-0.5 rounded-lg border border-slate-700 text-[11px] text-slate-300">
              <button
                type="button"
                onClick={() => setZoomScale(z => Math.max(0.4, z - 0.1))}
                className="p-0.5 hover:text-white cursor-pointer"
                title="کوچک‌نمایی"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="font-mono text-[10px] w-7 text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale(z => Math.min(1.4, z + 0.1))}
                className="p-0.5 hover:text-white cursor-pointer"
                title="بزرگ‌نمایی"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* چپ (پین‌شده): دکمه‌های عملیاتی پیش‌نمایش، ذخیره و خروج */}
        <div className="w-full lg:w-auto flex flex-wrap items-center justify-end gap-1.5 lg:gap-1 shrink-0 pt-1.5 lg:pt-0 border-t lg:border-t-0 border-slate-800 lg:pr-1 lg:border-r lg:border-slate-800">
          <button
            type="button"
            onClick={() => setPreviewWithSampleData(!previewWithSampleData)}
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-medium transition border cursor-pointer whitespace-nowrap ${
              previewWithSampleData
                ? 'bg-blue-900/60 border-blue-500/50 text-blue-200'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="پیش‌نمایش با داده نمونه"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden 2xl:inline">پیش‌نمایش با </span>
            <span className="sm:hidden xl:inline">داده نمونه</span>
            <span className="hidden sm:inline xl:hidden">نمونه</span>
          </button>

          <button
            type="button"
            onClick={handleSaveToBackend}
            disabled={saving}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] px-2.5 py-1 rounded-lg font-bold transition shadow-xs cursor-pointer whitespace-nowrap"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Save className="w-3.5 h-3.5 shrink-0" />}
            <span>{saving ? 'در حال ذخیره...' : 'ذخیره قالب‌ها'}</span>
          </button>

          <button
            type="button"
            onClick={handleRequestClose}
            className="p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer shrink-0"
            title="بستن پنجره طراح"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* سوییچر تب‌بندی موبایل: «فیلدها و تنظیمات» در مقابل «بوم طراحی برگه» تا در موبایل عرض بوم خرد نشود */}
      <div className="md:hidden bg-slate-900/95 border-b border-slate-700/80 px-2.5 py-2 grid grid-cols-2 gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setMobileViewMode('canvas')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            mobileViewMode === 'canvas'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
          }`}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>بوم طراحی برگه</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileViewMode('sidebar')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
            mobileViewMode === 'sidebar'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" />
          <span>فیلدها و تنظیمات</span>
        </button>
      </div>

      {/* ۲. بخش میانی: پنل سایدبار (راست) + بوم طراحی برگه واقعی چندصفحه‌ای (مرکز) */}
      <div className="flex-1 flex overflow-hidden bg-slate-950/60 min-h-0">
        {/* پنل راست: تب‌های «اقلام قابل افزودن»، «محاسبات فرمولی» و «تنظیمات بلوک انتخاب‌شده» */}
        <div
          className={`${
            mobileViewMode === 'sidebar' ? 'flex w-full' : 'hidden'
          } md:flex md:w-80 lg:w-96 shrink-0 bg-white dark:bg-slate-900 md:border-l border-slate-200 dark:border-slate-800 flex-col overflow-hidden z-10 shadow-lg`}
        >
          {/* تب‌بار بالای سایدبار (۳ تب مجزا) */}
          <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-1 gap-1">
            <button
              type="button"
              onClick={() => setSidebarTab('elements')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                sidebarTab === 'elements'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layout className="w-3.5 h-3.5" />
              <span>اقلام قالب</span>
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('calc')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                sidebarTab === 'calc'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>محاسبات</span>
              {activeTemplate?.calculatedBoxes?.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold flex items-center justify-center">
                  {activeTemplate.calculatedBoxes.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('settings')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                sidebarTab === 'settings'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>تنظیمات {selectedBlock ? '✓' : ''}</span>
            </button>
          </div>

          {/* تب ۱: اقلام قابل افزودن */}
          {sidebarTab === 'elements' && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-5">
              {/* میانبر مستقیم به باکس‌های محاسبات فرمولی */}
              <button
                type="button"
                onClick={() => setSidebarTab('calc')}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 text-right transition cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block group-hover:text-emerald-600">
                      باکس‌های محاسبات فرمولی
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      {activeTemplate?.calculatedBoxes?.length > 0 ? `${activeTemplate.calculatedBoxes.length} باکس تعریف شده (ویرایش)` : 'افزودن جمع کل، درصدها و شاخص‌ها'}
                    </span>
                  </div>
                </div>
                <ChevronLeft className="w-4 h-4 text-emerald-600 group-hover:-translate-x-0.5 transition" />
              </button>

              {/* بخش ۱: بلوک‌های ساختاری معماری ۳ ناحیه‌ای */}
              <div>
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-2">
                  بلوک‌های ساختاری سند (۳ ناحیه‌ای)
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {/* ۱. سربرگ رسمی */}
                  <button
                    type="button"
                    onClick={() => handleAddBlock('header', {
                      zone: 'header',
                      showLogo: true,
                      showTitle: true,
                      showTrackingCode: true,
                      showDate: true
                    }, 1)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-right transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block group-hover:text-blue-600">
                          سربرگ رسمی با لوگو (Header)
                        </span>
                        <span className="text-[10px] text-slate-400">ناحیه بالای صفحه با لوگوی سازمانی و رهگیری</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>

                  {/* ۲. کادر سکشن (Section Container) */}
                  <button
                    type="button"
                    onClick={() => handleAddBlock('sectionContainer', {
                      title: 'کادر سکشن جدید',
                      description: '',
                      zone: 'body',
                      colSpan: 2,
                      borderStyle: 'dashed',
                      showBorder: true,
                      fieldIds: [],
                      bgColor: 'transparent'
                    }, 1)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-right transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block group-hover:text-blue-600">
                          کادر سکشن (Section Container)
                        </span>
                        <span className="text-[10px] text-slate-400">محفظه تفکیک فیلدها با حاشیه نقطه‌چین، عنوان و توضیحات</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>

                  {/* ۳. جدول گردش‌کار و تاییدات */}
                  <button
                    type="button"
                    onClick={() => handleAddBlock('signatures', {
                      title: 'جدول تاییدات و امضاهای گردش‌کار',
                      zone: 'footer',
                      showComments: true,
                      colSpan: 2
                    }, totalPages)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-right transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <FileSignature className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block group-hover:text-blue-600">
                          جدول گردش‌کار و تاییدات (Footer)
                        </span>
                        <span className="text-[10px] text-slate-400">تاریخچه تاییدکنندگان، وضعیت اقدام و سمت‌ها</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>

                  {/* ۴. کد QR اصالت‌سنجی */}
                  <button
                    type="button"
                    onClick={() => handleAddBlock('qrCode', {
                      title: 'کد اصالت‌سنجی سند',
                      zone: 'footer',
                      showText: true,
                      colSpan: 1
                    }, totalPages)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-right transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block group-hover:text-blue-600">
                          کد QR اصالت‌سنجی سند
                        </span>
                        <span className="text-[10px] text-slate-400">بارکد دو بعدی استعلام الکترونیک سند</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>

                  {/* ۵. متن ثابت و یادداشت حقوقی */}
                  <button
                    type="button"
                    onClick={() => handleAddBlock('staticText', {
                      content: 'متن توضیحات حقوقی یا ضوابط اجرایی سازمانی مورد نظر را اینجا وارد کنید.',
                      zone: 'footer',
                      bgColor: 'default',
                      colSpan: 1
                    }, totalPages)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 text-right transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block group-hover:text-blue-600">
                          متن ثابت و یادداشت حقوقی
                        </span>
                        <span className="text-[10px] text-slate-400">متن دلخواه طراح با کادر و قالب‌بندی</span>
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
                  </button>
                </div>
              </div>

              {/* بخش ۲: فیلدهای اختصاصی فرم */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    فیلدهای فرم ({formQuestions.length})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {placedFieldIds.size} از {formQuestions.length} افزوده شده
                  </span>
                </div>

                {formQuestions.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 border border-dashed rounded-xl">
                    هیچ فیلدی در این فرم تعریف نشده است.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
                    {formQuestions.map((q) => {
                      const isPlaced = placedFieldIds.has(q.id);
                      const isTable = q.type === 'table' || q.type === 'repeater_grid';
                      return (
                        <div
                          key={q.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'field', fieldId: q.id }));
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => handleAddBlock('field', {
                            fieldId: q.id,
                            label: q.label,
                            showLabel: true,
                            zone: 'body',
                            colSpan: isTable ? 2 : 1,
                            showBorder: true,
                            hasBorder: true
                          }, 1)}
                          className={`p-2 rounded-xl border text-xs flex items-center justify-between transition cursor-pointer select-none ${
                            isPlaced
                              ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-700 dark:text-slate-300'
                              : 'border-slate-200 dark:border-slate-700/80 hover:border-blue-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-blue-50/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isPlaced ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="truncate font-medium">{q.label}</span>
                            {isTable && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono font-bold">
                                جدول چندسطری
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 mr-2">
                            {isPlaced ? (
                              <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
                                در برگه
                              </span>
                            ) : (
                              <span className="text-[9px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold shadow-2xs">
                                جدید
                              </span>
                            )}
                            <Plus className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* تب محاسبات فرمولی (Calculated Boxes) */}
          {sidebarTab === 'calc' && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
              {/* هدر بخش محاسبات فرمولی */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 block text-xs">
                      باکس‌های محاسبات فرمولی
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      خلاصه مبالغ، مالیات، میانگین و شاخص‌ها
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddCalculatedBox}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition shadow-xs cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن باکس</span>
                </button>
              </div>

              {/* راهنما در صورت خالی بودن */}
              {(!activeTemplate?.calculatedBoxes || activeTemplate.calculatedBoxes.length === 0) ? (
                <div className="py-10 text-center text-slate-400 space-y-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                  <Calculator className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
                  <div className="space-y-1">
                    <p className="font-bold text-slate-700 dark:text-slate-300 text-xs">هنوز هیچ باکس محاسباتی تعریف نشده است</p>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                      برای درج جمع کل اقلام، محاسبه مالیات، تخفیف، میانگین یا فرمول‌های ریاضی آزاد در برگه PDF، روی دکمه افزودن باکس کلیک کنید.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCalculatedBox}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن اولین باکس محاسباتی</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeTemplate.calculatedBoxes.map((box, bIdx) => {
                    const preview = evaluateFormula(box.formula, sampleAnswers, box);
                    const currentBoxes = activeTemplate.calculatedBoxes;

                    return (
                      <div
                        key={box.id || bIdx}
                        className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 shadow-2xs space-y-3 transition"
                      >
                        {/* سربرگ کارت باکس */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span className="w-5 h-5 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {bIdx + 1}
                            </span>
                            <input
                              type="text"
                              value={box.title || ''}
                              onChange={(e) => handleUpdateCalculatedBox(box.id, { title: e.target.value })}
                              placeholder="عنوان باکس (مثلاً جمع کل مبلغ)"
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleMoveCalculatedBox(box.id, 'up')}
                              disabled={bIdx === 0}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                              title="انتقال به بالا"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveCalculatedBox(box.id, 'down')}
                              disabled={bIdx === currentBoxes.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                              title="انتقال به پایین"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCalculatedBox(box.id)}
                              className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition cursor-pointer"
                              title="حذف این باکس"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* کادر فرمول آزاد */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <label className="font-semibold text-slate-700 dark:text-slate-300">
                              فرمول محاسباتی (ریاضی آزاد):
                            </label>
                            <span className="text-[10px] text-slate-400 font-mono">
                              +, -, *, /, %, (), SUM, AVG, ROUND
                            </span>
                          </div>
                          <textarea
                            id={`formula-input-${box.id}`}
                            value={box.formula || ''}
                            onChange={(e) => handleUpdateCalculatedBox(box.id, { formula: e.target.value })}
                            placeholder="مثلاً: SUM(table.col_amount) * 1.09 یا {q_price} * {q_count}"
                            rows={2}
                            dir="ltr"
                            className="w-full text-left font-mono text-xs px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                          />
                        </div>

                        {/* چیپ‌های درج سریع توکن و عملگرها */}
                        <div className="space-y-2 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                            درج سریع عملگرها و توابع در محل مکان‌نما:
                          </span>
                          
                          {/* عملگرهای پایه و توابع عمومی */}
                          <div className="flex flex-wrap gap-1">
                            {['+', '-', '*', '/', '(', ')', '%', 'ROUND(', 'ABS('].map((op) => (
                              <button
                                key={op}
                                type="button"
                                onClick={() => handleInsertTokenToBox(box.id, op)}
                                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 transition cursor-pointer"
                              >
                                {op}
                              </button>
                            ))}
                          </div>

                          {/* فیلدهای عددی فرم */}
                          {numericFields.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[9px] text-slate-400 block">فیلدهای عددی فرم:</span>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {numericFields.map((nf) => (
                                  <button
                                    key={nf.id}
                                    type="button"
                                    onClick={() => handleInsertTokenToBox(box.id, `{${nf.id}}`)}
                                    className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-[10px] font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition cursor-pointer flex items-center gap-1"
                                    title={`درج شناسه ${nf.id}`}
                                  >
                                    <Hash className="w-2.5 h-2.5" />
                                    <span>{nf.label}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ستون‌های جداول اقلام */}
                          {tableColumns.length > 0 && (
                            <div className="space-y-1 pt-1">
                              <span className="text-[9px] text-slate-400 block">توابع آماری جداول اقلام:</span>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {tables.map(tbl => (
                                  <button
                                    key={tbl.id}
                                    type="button"
                                    onClick={() => handleInsertTokenToBox(box.id, `COUNT(${tbl.id})`)}
                                    className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[10px] font-mono hover:bg-purple-100 transition cursor-pointer"
                                  >
                                    COUNT({tbl.label})
                                  </button>
                                ))}
                                {tableColumns.map((tc, tcIdx) => (
                                  <React.Fragment key={tcIdx}>
                                    <button
                                      type="button"
                                      onClick={() => handleInsertTokenToBox(box.id, `SUM(${tc.tableId}.${tc.columnId})`)}
                                      className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono hover:bg-emerald-100 transition cursor-pointer"
                                      title={`مجموع ستون ${tc.columnLabel} از ${tc.tableLabel}`}
                                    >
                                      SUM({tc.tableLabel}.{tc.columnLabel})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleInsertTokenToBox(box.id, `AVG(${tc.tableId}.${tc.columnId})`)}
                                      className="px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[10px] font-mono hover:bg-teal-100 transition cursor-pointer"
                                      title={`میانگین ستون ${tc.columnLabel}`}
                                    >
                                      AVG({tc.tableLabel}.{tc.columnLabel})
                                    </button>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* کارت پیش‌نمایش زنده نتیجه فرمول */}
                        <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                          preview.error
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        }`}>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {preview.error ? (
                              <>
                                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                                <span className="font-mono text-[10px] truncate" title={preview.error}>
                                  خطا: {preview.error}
                                </span>
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                <span className="text-[11px] font-bold">پیش‌نمایش:</span>
                                <span dir="ltr" className="font-mono font-bold text-sm tracking-tight truncate">
                                  {preview.formatted}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* تنظیمات نمایش: واحد، اعشار، جداکننده و عرض */}
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
                          {/* واحد / پسوند */}
                          <div className="space-y-1">
                            <label className="font-semibold text-slate-700 dark:text-slate-300 block">واحد / پسوند:</label>
                            <input
                              type="text"
                              value={box.unit || ''}
                              onChange={(e) => handleUpdateCalculatedBox(box.id, { unit: e.target.value })}
                              placeholder="ریال، کیلوگرم، درصد..."
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs"
                            />
                            {/* چیپ‌های پیشنهادی واحد */}
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {['ریال', 'تومان', 'درصد', 'عدد', 'کیلوگرم'].map(u => (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => handleUpdateCalculatedBox(box.id, { unit: u })}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 cursor-pointer"
                                >
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* تعداد ارقام اعشار */}
                          <div className="space-y-1">
                            <label className="font-semibold text-slate-700 dark:text-slate-300 block">تعداد اعشار:</label>
                            <select
                              value={box.decimals ?? 0}
                              onChange={(e) => handleUpdateCalculatedBox(box.id, { decimals: Number(e.target.value) })}
                              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs"
                            >
                              <option value={0}>بدون اعشار (۰)</option>
                              <option value={1}>۱ رقم اعشار (.0)</option>
                              <option value={2}>۲ رقم اعشار (.00)</option>
                              <option value={3}>۳ رقم اعشار (.000)</option>
                              <option value={4}>۴ رقم اعشار (.0000)</option>
                            </select>

                            {/* جداکننده سه‌رقمی */}
                            <label className="flex items-center gap-1.5 pt-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={box.useGrouping !== false}
                                onChange={(e) => handleUpdateCalculatedBox(box.id, { useGrouping: e.target.checked })}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="text-[10px] text-slate-600 dark:text-slate-400">جداکننده سه‌رقمی (۱,۰۰۰)</span>
                            </label>
                          </div>

                          {/* عرض باکس در برگه چاپی */}
                          <div className="col-span-2 flex items-center justify-between pt-1">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">عرض باکس:</span>
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                              {[
                                { label: '۱/۳ (یک‌سوم)', val: '1/3' },
                                { label: '۱/۲ (نیم‌عرض)', val: '1/2' },
                                { label: '۱/۱ (تمام‌عرض)', val: '1/1' }
                              ].map(w => (
                                <button
                                  key={w.val}
                                  type="button"
                                  onClick={() => handleUpdateCalculatedBox(box.id, { width: w.val })}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                                    (box.width || '1/3') === w.val
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                  }`}
                                >
                                  {w.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* تم رنگی باکس */}
                          <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/50">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">رنگ حاشیه و زمینه:</span>
                            <div className="flex items-center gap-1.5">
                              {[
                                { key: 'blue', label: 'آبی', bg: 'bg-blue-500' },
                                { key: 'emerald', label: 'سبز', bg: 'bg-emerald-500' },
                                { key: 'purple', label: 'بنفش', bg: 'bg-purple-500' },
                                { key: 'amber', label: 'کهربایی', bg: 'bg-amber-500' },
                                { key: 'slate', label: 'طوسی', bg: 'bg-slate-500' }
                              ].map(c => (
                                <button
                                  key={c.key}
                                  type="button"
                                  onClick={() => handleUpdateCalculatedBox(box.id, { color: c.key })}
                                  className={`w-4 h-4 rounded-full ${c.bg} transition ${
                                    (box.color || 'blue') === c.key ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110' : 'opacity-60 hover:opacity-100'
                                  }`}
                                  title={c.label}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* تب ۲: پنل تنظیمات پیشرفته بلوک انتخاب‌شده */}
          {sidebarTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {!selectedBlock ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <Sliders className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="font-bold text-slate-600 dark:text-slate-400">هیچ بلوکی انتخاب نشده است</p>
                  <p className="text-[11px] text-slate-400">برای تغییر مشخصات، ابتدا روی یکی از بلوک‌های داخل برگه یا فیلدهای درون کادر سکشن کلیک کنید.</p>
                </div>
              ) : selectedSectionFieldId && (selectedBlock.type === 'sectionContainer' || selectedBlock.type === 'sectionTitle') ? (
                // پنل تنظیمات مستقل فیلد درون کادر سکشن
                (() => {
                  const q = formQuestionsMap.get(selectedSectionFieldId);
                  const fConfig = (selectedBlock.fieldSettings && selectedBlock.fieldSettings[selectedSectionFieldId]) || {};
                  const curColSpan = fConfig.colSpan || (q?.type === 'table' ? 12 : 6);
                  const curLabel = fConfig.customLabel !== undefined ? fConfig.customLabel : (q?.label || 'فیلد');
                  const curFontSize = normalizeFontSizeKey(fConfig.fontSize || selectedBlock.fontSize);
                  const curTextAlign = normalizeTextAlign(fConfig.textAlign || selectedBlock.textAlign);
                  const curPadding = fConfig.padding || 'sm';
                  const curShowBorder = fConfig.showBorder !== undefined ? fConfig.showBorder : true;
                  const curBgColor = fConfig.bgColor || 'transparent';
                  const curShowLabel = fConfig.showLabel !== false;

                  return (
                    <div className="space-y-4">
                      {/* هدر و دکمه بازگشت به تنظیمات کل سکشن */}
                      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-blue-600 dark:text-blue-400 truncate">
                            تنظیمات فیلد: {curLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSectionField(selectedBlock.id, selectedSectionFieldId)}
                            className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition cursor-pointer"
                            title="حذف این فیلد از کادر سکشن"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedSectionFieldId(null)}
                          className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer transition font-medium"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                          <span>بازگشت به تنظیمات کادر سکشن والد ({selectedBlock.title || 'سکشن'})</span>
                        </button>
                      </div>

                      {/* ۱. عرض فیلد در سکشن */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                          عرض فیلد در شبکه کادر سکشن:
                        </label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                          <button
                            type="button"
                            onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { colSpan: 12 })}
                            className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                              curColSpan === 12 ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                            }`}
                          >
                            تمام‌عرض (1/1)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { colSpan: 6 })}
                            className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                              curColSpan === 6 ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                            }`}
                          >
                            نیم‌عرض (1/2)
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { colSpan: 4 })}
                            className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                              curColSpan === 4 ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                            }`}
                          >
                            یک‌سوم (1/3)
                          </button>
                        </div>
                      </div>

                      {/* ۲. عنوان سفارشی */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                          عنوان / برچسب نمایشی:
                        </label>
                        <input
                          type="text"
                          value={curLabel}
                          onChange={(e) => updateSectionField(selectedBlock.id, selectedSectionFieldId, { customLabel: e.target.value })}
                          placeholder={q?.label || 'عنوان فیلد'}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 dark:text-slate-100"
                        />
                      </div>

                      {/* ۳. نمایش یا مخفی‌سازی برچسب */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-slate-700 dark:text-slate-300">نمایش برچسب فیلد:</span>
                        <input
                          type="checkbox"
                          checked={curShowLabel}
                          onChange={(e) => updateSectionField(selectedBlock.id, selectedSectionFieldId, { showLabel: e.target.checked })}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>

                      {/* ۴. اندازه فونت */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">اندازه قلم (Font Size):</label>
                        <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                          {[
                            { key: 'xs', label: 'بسیار ریز' },
                            { key: 'sm', label: 'ریز' },
                            { key: 'normal', label: 'عادی' },
                            { key: 'lg', label: 'درشت' }
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { fontSize: item.key })}
                              className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                                curFontSize === item.key ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ۵. تراز متن */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">تراز متن (Align):</label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                          {[
                            { key: 'right', label: 'راست', icon: AlignRight },
                            { key: 'center', label: 'وسط', icon: AlignCenter },
                            { key: 'left', label: 'چپ', icon: AlignLeft }
                          ].map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { textAlign: item.key })}
                                className={`py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium transition cursor-pointer ${
                                  curTextAlign === item.key ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ۶. فاصله داخلی */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">فاصله داخلی (Padding):</label>
                        <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                          {[
                            { key: 'sm', label: 'کم' },
                            { key: 'md', label: 'متوسط' },
                            { key: 'lg', label: 'زیاد' }
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { padding: item.key })}
                              className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                                curPadding === item.key ? 'bg-blue-600 text-white font-bold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ۷. کادر دور */}
                      <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-slate-700 dark:text-slate-300">نمایش کادر دور (Border):</span>
                        <button
                          type="button"
                          onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { showBorder: !curShowBorder })}
                          className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                            curShowBorder ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                          }`}
                        >
                          {curShowBorder ? 'فعال (دارای کادر)' : 'غیرفعال (بدون کادر)'}
                        </button>
                      </div>

                      {/* ۸. رنگ پس‌زمینه */}
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">رنگ پس‌زمینه فیلد:</label>
                        <div className="grid grid-cols-6 gap-2">
                          {BG_COLOR_OPTIONS.map((c) => {
                            const isSelected = (c.value === 'default' && (!curBgColor || curBgColor === 'default' || curBgColor === 'transparent')) || (curBgColor === c.value);
                            return (
                              <button
                                key={c.value}
                                type="button"
                                onClick={() => updateSectionField(selectedBlock.id, selectedSectionFieldId, { bgColor: c.value })}
                                style={{
                                  backgroundColor: c.value === 'default' ? undefined : c.hex
                                }}
                                className={`h-7 rounded-lg border flex items-center justify-center transition cursor-pointer relative shadow-xs ${
                                  c.value === 'default' ? 'border-dashed border-slate-400 bg-slate-100 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-600'
                                } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 scale-105' : 'hover:scale-105'}`}
                                title={c.label}
                              >
                                {isSelected && (
                                  <Check className={`w-3.5 h-3.5 ${c.isDark ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      تنظیمات: {selectedBlock.type === 'field' ? (selectedBlock.customLabel || selectedBlock.label || 'فیلد') : selectedBlock.type === 'sectionTitle' ? (selectedBlock.title || 'عنوان بخش') : selectedBlock.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteBlock(selectedBlock.id)}
                      className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 transition cursor-pointer"
                      title="حذف این بلوک"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* موقعیت برگه و ناحیه بلوک */}
                  {selectedBlock.type !== 'header' && (
                    <div className="space-y-2">
                      <label className="block font-bold text-slate-700 dark:text-slate-300">صفحه قرارگیری بلوک:</label>
                      <div className="flex flex-wrap gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        {Array.from({ length: totalPages }).map((_, i) => {
                          const pNum = i + 1;
                          const isCurrentPage = (selectedBlock.page || 1) === pNum;
                          return (
                            <button
                              key={pNum}
                              type="button"
                              onClick={() => updateBlock(selectedBlock.id, { page: pNum })}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                isCurrentPage
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              برگه {pNum}
                            </button>
                          );
                        })}
                      </div>

                      <label className="block font-bold text-slate-700 dark:text-slate-300 pt-1">ناحیه سند (Zone):</label>
                      <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { zone: 'body' })}
                          className={`py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            (selectedBlock.zone || 'body') === 'body'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          ناحیه بدنه
                        </button>
                        <button
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { zone: 'footer' })}
                          className={`py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            selectedBlock.zone === 'footer'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          ناحیه پاورقی
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ۱. عرض بلوک در سطر */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">عرض بلوک در برگه:</label>
                    <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => updateBlock(selectedBlock.id, { colSpan: 2 })}
                        className={`py-1.5 rounded-lg font-bold text-center transition cursor-pointer ${
                          selectedBlock.colSpan === 2
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        تمام‌عرض ۱/۱
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBlock(selectedBlock.id, { colSpan: 1 })}
                        className={`py-1.5 rounded-lg font-bold text-center transition cursor-pointer ${
                          selectedBlock.colSpan === 1
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        نیم‌عرض ۱/۲
                      </button>
                      <button
                        type="button"
                        onClick={() => updateBlock(selectedBlock.id, { colSpan: 3 })}
                        className={`py-1.5 rounded-lg font-bold text-center transition cursor-pointer ${
                          selectedBlock.colSpan === 3
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        یک‌سوم ۱/۳
                      </button>
                    </div>
                  </div>

                  {/* ۲. اندازه قلم (Font Size) */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">اندازه قلم (Font Size):</label>
                    <div className="grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                      {[
                        { key: 'xs', label: 'بسیار ریز' },
                        { key: 'sm', label: 'ریز' },
                        { key: 'normal', label: 'عادی' },
                        { key: 'lg', label: 'درشت' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { fontSize: item.key })}
                          className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                            normalizeFontSizeKey(selectedBlock.fontSize) === item.key
                              ? 'bg-blue-600 text-white font-bold shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ۳. تراز متن (Alignment) */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">تراز متن (Align):</label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                      {[
                        { key: 'right', label: 'راست', icon: AlignRight },
                        { key: 'center', label: 'وسط', icon: AlignCenter },
                        { key: 'left', label: 'چپ', icon: AlignLeft }
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => updateBlock(selectedBlock.id, { textAlign: item.key })}
                            className={`py-1.5 rounded-lg flex items-center justify-center gap-1 font-medium transition cursor-pointer ${
                              normalizeTextAlign(selectedBlock.textAlign) === item.key
                                ? 'bg-blue-600 text-white font-bold shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                            }`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ۴. فاصله داخلی (Padding) */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">فاصله داخلی (Padding):</label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-center">
                      {[
                        { key: 'sm', label: 'کم' },
                        { key: 'md', label: 'متوسط' },
                        { key: 'lg', label: 'زیاد' }
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => updateBlock(selectedBlock.id, { padding: item.key })}
                          className={`py-1 rounded-lg font-medium transition cursor-pointer ${
                            (selectedBlock.padding || 'sm') === item.key
                              ? 'bg-blue-600 text-white font-bold shadow-xs'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ۵. کادر دور (Border) - اتصال مستقیم به showBorder و حذف کامل خط حاشیه هنگام غیرفعال‌سازی */}
                  <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-slate-700 dark:text-slate-300">نمایش کادر دور (Border):</span>
                    <button
                      type="button"
                      onClick={() => {
                        const currentVal = selectedBlock.showBorder !== undefined ? selectedBlock.showBorder : (selectedBlock.hasBorder !== undefined ? selectedBlock.hasBorder : true);
                        updateBlock(selectedBlock.id, { showBorder: !currentVal, hasBorder: !currentVal });
                      }}
                      className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                        (selectedBlock.showBorder !== false && selectedBlock.hasBorder !== false)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {(selectedBlock.showBorder !== false && selectedBlock.hasBorder !== false) ? 'فعال (دارای کادر)' : 'غیرفعال (بدون کادر)'}
                    </button>
                  </div>

                  {/* ۶. رنگ پس‌زمینه (Background Color) */}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">رنگ پس‌زمینه:</label>
                    <div className="grid grid-cols-6 gap-2">
                      {BG_COLOR_OPTIONS.map((c) => {
                        const isSelected = (c.value === 'default' && (!selectedBlock.bgColor || selectedBlock.bgColor === 'default' || selectedBlock.bgColor === 'transparent')) || (selectedBlock.bgColor === c.value);
                        return (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => updateBlock(selectedBlock.id, { bgColor: c.value })}
                            style={{
                              backgroundColor: c.value === 'default' ? undefined : c.hex
                            }}
                            className={`h-7 rounded-lg border flex items-center justify-center transition cursor-pointer relative shadow-xs ${
                              c.value === 'default' ? 'border-dashed border-slate-400 bg-slate-100 dark:bg-slate-800' : 'border-slate-300 dark:border-slate-600'
                            } ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1 scale-105' : 'hover:scale-105'}`}
                            title={c.label}
                          >
                            {isSelected && (
                              <Check className={`w-3.5 h-3.5 ${c.isDark ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ۷. تنظیمات اختصاصی کادر سکشن (sectionContainer) */}
                  {(selectedBlock.type === 'sectionContainer' || selectedBlock.type === 'sectionTitle') && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان کادر سکشن:</label>
                        <input
                          type="text"
                          value={selectedBlock.title || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                          placeholder="مثال: بخش اول: مشخصات عمومی"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">توضیحات و راهنمای سکشن (اختیاری):</label>
                        <textarea
                          rows={2}
                          value={selectedBlock.description || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { description: e.target.value })}
                          placeholder="متن توضیحی یا راهنمای تکمیل این بخش..."
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">نوع حاشیه کادر سکشن:</label>
                        <select
                          value={selectedBlock.borderStyle || 'dashed'}
                          onChange={(e) => updateBlock(selectedBlock.id, { borderStyle: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none text-slate-800 dark:text-slate-100"
                        >
                          <option value="dashed">حاشیه نقطه‌چین (Dashed - استاندارد)</option>
                          <option value="solid">خط ممتد (Solid)</option>
                          <option value="none">بدون حاشیه (None)</option>
                        </select>
                      </div>

                      {/* مدیریت فیلدهای قرارگرفته داخل این کادر سکشن */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                        <label className="block font-bold text-slate-700 dark:text-slate-300 text-xs">
                          فیلدهای درون این کادر ({((selectedBlock.fieldIds || []).length)} فیلد):
                        </label>

                        {/* فیلدهای اختصاص‌یافته فعلی با امکان کلیک برای تنظیمات مستقل */}
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {(selectedBlock.fieldIds || []).length === 0 ? (
                            <div className="text-[11px] text-slate-400 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-center">
                              هنوز فیلدی به این کادر اضافه نشده است.
                            </div>
                          ) : (
                            (selectedBlock.fieldIds || []).map((fId) => {
                              const q = formQuestionsMap.get(fId);
                              const fConfig = (selectedBlock.fieldSettings && selectedBlock.fieldSettings[fId]) || {};
                              const fCol = fConfig.colSpan || (q?.type === 'table' ? 12 : 6);
                              return (
                                <div
                                  key={fId}
                                  onClick={() => setSelectedSectionFieldId(fId)}
                                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs cursor-pointer hover:border-blue-400 transition"
                                  title="کلیک جهت تنظیمات مستقل این فیلد"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <Sliders className="w-3 h-3 text-blue-500 shrink-0" />
                                    <span className="truncate text-slate-700 dark:text-slate-200 font-medium">
                                      {fConfig.customLabel || q?.label || fId}
                                    </span>
                                    <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-slate-600 dark:text-slate-300">
                                      {fCol === 12 ? '1/1' : fCol === 4 ? '1/3' : '1/2'}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveSectionField(selectedBlock.id, fId);
                                    }}
                                    className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                                    title="خروج فیلد از این سکشن"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>

                        {/* افزودن فیلد جدید از میان فیلدهای فرم */}
                        <div>
                          <select
                            value=""
                            onChange={(e) => {
                              const fId = e.target.value;
                              if (!fId) return;
                              const currentIds = selectedBlock.fieldIds || [];
                              if (!currentIds.includes(fId)) {
                                updateBlock(selectedBlock.id, { fieldIds: [...currentIds, fId] });
                              }
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-200"
                          >
                            <option value="">+ افزودن فیلد به این کادر سکشن...</option>
                            {formQuestions
                              .filter(q => !(selectedBlock.fieldIds || []).includes(q.id))
                              .map(q => (
                                <option key={q.id} value={q.id}>
                                  {q.label} ({q.type})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ۸. تنظیمات اختصاصی فیلد */}
                  {selectedBlock.type === 'field' && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان سفارشی فیلد:</label>
                        <input
                          type="text"
                          value={selectedBlock.customLabel !== undefined ? selectedBlock.customLabel : (selectedBlock.label || '')}
                          onChange={(e) => updateBlock(selectedBlock.id, { customLabel: e.target.value })}
                          placeholder="عنوان دلخواه در برگه چاپ"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showLabel !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showLabel: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-slate-700 dark:text-slate-300">نمایش برچسب عنوان فیلد</span>
                      </label>
                    </div>
                  )}

                  {/* ۹. تنظیمات اختصاصی متن ثابت */}
                  {selectedBlock.type === 'staticText' && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">محتوای متن:</label>
                      <textarea
                        value={selectedBlock.content || ''}
                        onChange={(e) => updateBlock(selectedBlock.id, { content: e.target.value })}
                        rows={3}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* ۱۰. تنظیمات سربرگ */}
                  {selectedBlock.type === 'header' && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showLogo !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showLogo: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>نمایش لوگوی سازمان</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showTitle !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showTitle: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>نمایش عنوان فرم</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showTrackingCode !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showTrackingCode: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>نمایش کد رهگیری</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showDate !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showDate: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>نمایش تاریخ صدور</span>
                      </label>
                    </div>
                  )}

                  {/* ۱۱. تنظیمات امضاها */}
                  {selectedBlock.type === 'signatures' && (
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div>
                        <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">عنوان جدول تاییدات:</label>
                        <input
                          type="text"
                          value={selectedBlock.title || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { title: e.target.value })}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlock.showComments !== false}
                          onChange={(e) => updateBlock(selectedBlock.id, { showComments: e.target.checked })}
                          className="rounded text-blue-600"
                        />
                        <span>نمایش ستون توضیحات / هامش اقدام‌کننده</span>
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* بوم مرکزی: برگه‌های چندگانه واقعی متناسب با A4 / A5 با فونت یکدست IRANSans */}
        <div
          ref={canvasWrapperRef}
          className={`${
            mobileViewMode === 'canvas' ? 'flex' : 'hidden'
          } md:flex flex-1 min-w-0 overflow-auto p-3 sm:p-6 md:p-10 flex-col items-center`}
        >
          <div
            className="bpms-scale-shell mx-auto shrink-0 relative"
            style={
              isMobileViewport
                ? {
                    width: `${scaledWidth}px`,
                    height: `${scaledHeight}px`
                  }
                : undefined
            }
          >
            <div
              ref={canvasContentRef}
              style={
                isMobileViewport
                  ? {
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: `${basePxWidth}px`,
                      transform: `scale(${effectiveScale})`,
                      transformOrigin: 'top right',
                      transition: 'transform 0.15s ease'
                    }
                  : {
                      transform: `scale(${effectiveScale})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.15s ease'
                    }
              }
              className="space-y-8 md:space-y-12"
            >
            {/* رندر واقعی برگه‌های چندگانه (Multi-Page Sheets) */}
            {Array.from({ length: totalPages }).map((_, pIdx) => {
              const pageNumber = pIdx + 1;

              // بلوک‌های بدنه متعلق به این صفحه
              const pageBodyBlocks = (activeTemplate?.blocks || []).filter(b => {
                const bPage = b.page || 1;
                const bZone = b.zone || (b.type === 'header' ? 'header' : (b.type === 'signatures' || b.type === 'qrCode') ? 'footer' : 'body');
                return bPage === pageNumber && bZone === 'body';
              });

              // بلوک‌های پاورقی این برگه (اگر footerPosition تمام صفحات باشد، یا صفحه آخر باشد)
              const showFooterOnThisPage = (activeTemplate?.footerPosition === 'allPages') || (pageNumber === totalPages);
              const pageFooterBlocks = showFooterOnThisPage
                ? (activeTemplate?.blocks || []).filter(b => {
                    const bZone = b.zone || (b.type === 'header' ? 'header' : (b.type === 'signatures' || b.type === 'qrCode') ? 'footer' : 'body');
                    return bZone === 'footer';
                  })
                : [];

              return (
                <div
                  key={pageNumber}
                  className="bpms-print-sheet !bg-white !text-slate-900 shadow-2xl rounded-sm border border-slate-300 relative select-none flex flex-col font-['IRANSansX','IRANSans','Vazirmatn',sans-serif]"
                  style={{
                    width: `${basePxWidth}px`,
                    minHeight: `${basePxHeight}px`,
                    padding: `${(activeTemplate?.margins?.top || 15) * 3.78}px ${(activeTemplate?.margins?.right || 15) * 3.78}px ${(activeTemplate?.margins?.bottom || 15) * 3.78}px ${(activeTemplate?.margins?.left || 15) * 3.78}px`
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnZone(pageNumber, 'body');
                  }}
                >
                  {/* نشانگر اندازه کاغذ و برگه جاری در بالای برگه */}
                  <div className="absolute top-2 left-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono !text-slate-700 !bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
                      {curPaperSize} {curOrientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE'} ({sheetMm.width}×{sheetMm.height}mm)
                    </span>
                    <span className="text-[10px] font-bold !bg-blue-100 !text-blue-800 border border-blue-200 px-2.5 py-0.5 rounded-full">
                      برگه {pageNumber} از {totalPages}
                    </span>
                  </div>

                  {/* دکمه حذف صفحه در صورت چندصفحه‌ای بودن */}
                  {pageNumber > 1 && (
                    <div className="absolute top-2 right-2">
                      <button
                        type="button"
                        onClick={() => handleDeletePage(pageNumber)}
                        className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded flex items-center gap-1 transition cursor-pointer"
                        title="حذف این صفحه و انتقال بلوک‌های آن به صفحه قبل"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف این برگه</span>
                      </button>
                    </div>
                  )}

                  {/* ========================================================
                      ناحیه ۱: سربرگ رسمی (Header Zone)
                      ======================================================== */}
                  <div className="mb-4">
                    {pageNumber === 1 ? (
                      headerBlock ? (
                        <div
                          onClick={() => {
                            setSelectedBlockId(headerBlock.id);
                            setSidebarTab('settings');
                          }}
                          className={`cursor-pointer rounded-lg transition ${
                            selectedBlockId === headerBlock.id ? 'ring-2 ring-blue-500 border-blue-400' : ''
                          }`}
                        >
                          <div className="pb-3 border-b-2 border-slate-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                {headerBlock.showLogo && (
                                  <img
                                    src={branding?.logoUrl || '/branding/Logo.png'}
                                    alt="Logo"
                                    className="h-12 w-auto max-w-[100px] object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                )}
                                <div>
                                  <span className="text-[11px] font-bold !text-slate-700 block">
                                    {branding?.systemTitle || 'جمهوری اسلامی ایران'}
                                  </span>
                                  <span className="text-xs !text-slate-600">سامانه الکترونیک فرم‌ها و فرآیندها</span>
                                </div>
                              </div>

                              <div className="text-center px-4">
                                <h2 className="text-base font-extrabold !text-slate-900">
                                  {form.title}
                                </h2>
                                <span className="text-[10px] !text-slate-600 font-medium">
                                  {activeTemplate?.name || 'قالب چاپ'}
                                </span>
                              </div>

                              <div className="text-left text-[10px] !text-slate-700 font-mono space-y-0.5">
                                {headerBlock.showTrackingCode && (
                                  <div>
                                    <span>کد رهگیری: </span>
                                    <b className="!text-slate-900 font-bold">{sampleData.trackingCode}</b>
                                  </div>
                                )}
                                {headerBlock.showDate && (
                                  <div>
                                    <span>تاریخ صدور: </span>
                                    <span className="!text-slate-900">۱۴۰۳/۰۸/۲۶</span>
                                  </div>
                                )}
                                <div>
                                  <span>پیوست: </span>
                                  <span className="!text-slate-900">ندارد</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 text-center text-xs !text-slate-600 border border-dashed rounded-lg">
                          سربرگ رسمی حذف شده است.
                        </div>
                      )
                    ) : (
                      // تکرار خودکار سربرگ در بالای صفحات بعدی
                      activeTemplate?.repeatHeaderOnAllPages !== false && headerBlock ? (
                        <div>
                          <div className="flex items-center justify-between pb-1">
                            <span className="text-[9px] font-bold !text-blue-700 flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              <span>تکرار خودکار سربرگ رسمی در برگه {pageNumber}</span>
                            </span>
                          </div>
                          <div className="pb-2.5 border-b border-slate-300 opacity-90">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {headerBlock.showLogo && (
                                  <img
                                    src={branding?.logoUrl || '/branding/Logo.png'}
                                    alt="Logo"
                                    className="h-9 w-auto max-w-[80px] object-contain"
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                  />
                                )}
                                <div>
                                  <span className="text-[10px] font-bold !text-slate-900 block">{form.title}</span>
                                  <span className="text-[9px] !text-slate-600">{branding?.systemTitle || 'سامانه جامع سازمانی'}</span>
                                </div>
                              </div>
                              <div className="text-left text-[9px] !text-slate-700 font-mono">
                                <span>کد رهگیری: </span>
                                <b className="!text-slate-900">{sampleData.trackingCode}</b>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>

                  {/* ========================================================
                      ناحیه ۲: بدنه و محتوا (Body Zone)
                      ======================================================== */}
                  <div
                    className="flex flex-wrap gap-y-3 -mx-1.5 flex-1 content-start min-h-[140px] p-1.5 rounded-xl border border-dashed border-slate-200/80"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropOnZone(pageNumber, 'body');
                    }}
                  >
                    {pageBodyBlocks.length === 0 ? (
                      <div className="w-full py-12 text-center !text-slate-600">
                        <Layout className="w-8 h-8 mx-auto mb-1 text-slate-400" />
                        <span className="text-xs font-medium !text-slate-700">هیچ فیلدی در بدنه این برگه چیده نشده است.</span>
                        <p className="text-[10px] !text-slate-600 mt-0.5">
                          بلوک‌ها را بکشید و در اینجا رها کنید، یا از سایدبار اضافه نمایید.
                        </p>
                      </div>
                    ) : (
                      pageBodyBlocks.map((block, bIdx) => renderCanvasBlock(block, bIdx, pageBodyBlocks.length, 'body'))
                    )}
                  </div>

                  {/* پیش‌نمایش باکس‌های محاسبات فرمولی روی بوم طراحی برگه */}
                  {showFooterOnThisPage && activeTemplate?.calculatedBoxes && activeTemplate.calculatedBoxes.length > 0 && (
                    <div
                      onClick={() => setSidebarTab('calc')}
                      className="cursor-pointer hover:ring-2 hover:ring-emerald-400 rounded-xl transition"
                      title="کلیک جهت ویرایش باکس‌های محاسباتی در سایدبار"
                    >
                      <CalculatedBoxesGrid
                        boxes={activeTemplate.calculatedBoxes}
                        answers={sampleAnswers}
                        isSampleData={true}
                        onBoxClick={() => setSidebarTab('calc')}
                      />
                    </div>
                  )}

                  {/* ========================================================
                      ناحیه ۳: پاورقی و تاییدات نهایی (Footer Zone)
                      ======================================================== */}
                  {showFooterOnThisPage && pageFooterBlocks.length > 0 && (
                    <div
                      className="mt-6 pt-3 border-t border-slate-200/90 space-y-3"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnZone(pageNumber, 'footer');
                      }}
                    >
                      <div className="flex flex-wrap gap-y-3 -mx-1.5">
                        {pageFooterBlocks.map((block, bIdx) => renderCanvasBlock(block, bIdx, pageFooterBlocks.length, 'footer'))}
                      </div>
                    </div>
                  )}

                  {/* نوار فوتر انتهای برگه با شماره صفحه */}
                  <div className="mt-auto pt-3 border-t border-slate-200 flex items-center justify-between text-[9px] !text-slate-600 font-mono">
                    <span className="!text-slate-600">نوافلو (NovaFlow) — سامانه یکپارچه مدیریت فرآیندهای سازمانی</span>
                    <span className="font-bold !text-slate-800">برگه {pageNumber} از {totalPages}</span>
                    <span className="!text-slate-600">چاپ سیستمی فاقد قلم‌خوردگی معتبر است</span>
                  </div>
                </div>
              );
            })}

            {/* دکمه افزودن صفحه جدید در زیر برگه‌ها */}
            <div className="flex justify-center pb-8">
              <button
                type="button"
                onClick={handleAddNewPage}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-2xl shadow-lg transition cursor-pointer text-xs group"
              >
                <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
                <span>افزودن صفحه جدید (برگه {totalPages + 1} از {totalPages + 1})</span>
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
