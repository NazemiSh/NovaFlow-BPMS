import React, { useState, useRef, useEffect, useMemo } from 'react';
import { toJalaali, toGregorian, jalaaliMonthLength } from 'jalaali-js';
import {
  Inbox,
  Send,
  Share2,
  Calendar,
  Search,
  Filter,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  User,
  FileText
} from 'lucide-react';
import PdfExportPreviewModal from './PdfExportPreviewModal';
import PrintTemplateDesignerModal from './PrintTemplateDesignerModal';
import ErrorBoundary from './ErrorBoundary';
import FormViewer from './FormViewer';
import { useDialog } from './GlobalDialogProvider';

const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'
];

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

export function toPersianDigits(n) {
  return String(n ?? '').replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export function PersianDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ شمسی...' }) {
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
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181926] cursor-pointer hover:border-indigo-400 text-xs transition"
      >
        <span className={value ? 'text-slate-800 dark:text-slate-100 font-mono font-medium' : 'text-slate-400'}>
          {value || placeholder}
        </span>
        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 right-0 w-64 bg-white dark:bg-[#1e2030] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 select-none">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/80">
            <button type="button" onClick={() => changeMonth(1)} className="p-1 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-100">
              {PERSIAN_MONTHS[viewState.jm - 1]} {viewState.jy}
            </span>
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-1">
            <span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const formatted = `${viewState.jy}/${String(viewState.jm).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
              const isSelected = value === formatted;
              const isToday = currentJ.jy === viewState.jy && currentJ.jm === viewState.jm && currentJ.jd === day;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`w-7 h-7 text-xs rounded-lg flex items-center justify-center font-mono transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-bold'
                      : isToday
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="w-full mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/80 text-[11px] text-rose-600 dark:text-rose-400 hover:underline text-center"
            >
              پاک کردن تاریخ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { FormViewer };

/**
 * المان مدرن، مینیمال و سه‌بعدی برای وضعیت خالی کارتابل
 * شامل کاشی ۳بعدی بزرگ و براق با آیکون Inbox سفید و حلقه هاله ملایم
 */
function EmptyCartable3D({ message = 'موردی با مشخصات فیلترهای انتخابی در کارتابل یافت نشد.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center select-none animate-in fade-in duration-300">
      {/* حلقه هاله ملایم دور کاشی */}
      <div className="p-4 rounded-full bg-blue-500/10 dark:bg-blue-400/10 mb-4 flex items-center justify-center">
        {/* کاشی سه‌بعدی بزرگ و براق */}
        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-xl shadow-blue-500/20 border-b-4 border-blue-800/50 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45)] flex items-center justify-center overflow-hidden">
          {/* هایلایت شیشه‌ای در نیمه بالایی */}
          <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent rounded-t-3xl pointer-events-none" />

          {/* آیکن Inbox سفید درخشان در مرکز کاشی */}
          <Inbox className="w-10 h-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] stroke-[2.2] relative z-10" />
        </div>
      </div>

      <p className="text-sm font-semibold text-slate-500 dark:text-[#b0b8c8] max-w-md leading-relaxed">
        {message}
      </p>
    </div>
  );
}

export default function CartableTabs({
  activeTab,
  inbox = [],
  outbox = [],
  ccInbox = [],
  forms = [],
  user = {},
  branding = {},
  onRefresh,
  onTransition,
  onOpenDelegationModal,
  activeDelegation,
  onCancelDelegation,
  onNavigateToForms,
  externalSearchRequest = null
}) {
  const { toast, confirm } = useDialog();
  // مودال‌های خروجی PDF و طراح قالب چاپ
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [selectedFormForPdf, setSelectedFormForPdf] = useState(null);
  const [selectedPdfSubmissions, setSelectedPdfSubmissions] = useState([]);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [selectedFormForDesigner, setSelectedFormForDesigner] = useState(null);
  const [openPopoverStepKey, setOpenPopoverStepKey] = useState(null);

  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest('[data-step-popover]') && !e.target.closest('[data-popover-trigger]')) {
        setOpenPopoverStepKey(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const getFormAndTemplatesForItem = (item) => {
    let formObj = forms.find(f => f.title === item.formTitle);
    let schema = null;
    try {
      if (item.formSchemaJson) {
        schema = typeof item.formSchemaJson === 'string' ? JSON.parse(item.formSchemaJson) : item.formSchemaJson;
      } else if (formObj?.schemaJson) {
        schema = typeof formObj.schemaJson === 'string' ? JSON.parse(formObj.schemaJson) : formObj.schemaJson;
      }
    } catch (e) {}

    const printTemplates = Array.isArray(schema?.printTemplates) ? schema.printTemplates : [];
    return {
      form: formObj || {
        formID: item.formId || 0,
        title: item.formTitle,
        schemaJson: item.formSchemaJson || JSON.stringify(schema || {})
      },
      hasPrintTemplates: printTemplates.length > 0,
      printTemplates
    };
  };

  const handleOpenPdfForItem = async (item) => {
    const { form, hasPrintTemplates } = getFormAndTemplatesForItem(item);
    if (!hasPrintTemplates) {
      if (user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) {
        const confirmed = await confirm({
          title: 'عدم وجود قالب چاپ',
          message: 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است. آیا مایلید اکنون وارد محیط طراحی قالب چاپ شوید؟',
          confirmText: 'ورود به طراح قالب چاپ',
          variant: 'primary'
        });
        if (confirmed) {
          setSelectedFormForDesigner(form);
          setDesignerOpen(true);
        }
      } else {
        toast.warning('ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است.');
      }
      return;
    }

    const sub = {
      ...item,
      submissionID: item.submissionId || item.submissionID,
      submissionId: item.submissionId || item.submissionID,
      trackingCode: item.trackingCode,
      workflowStatus: item.workflowStatus,
      submittedAt: item.submittedAt,
      submittedByUserName: item.submittedByUserName,
      dataJSON: item.formDataJson || item.dataJSON,
      stepsProgress: item.stepsProgress || item.StepsProgress || []
    };
    setSelectedFormForPdf(form);
    setSelectedPdfSubmissions([sub]);
    setPdfModalOpen(true);
  };

  const renderModals = () => (
    <>
      {pdfModalOpen && selectedFormForPdf && (
        <PdfExportPreviewModal
          isOpen={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          form={selectedFormForPdf}
          submissions={selectedPdfSubmissions}
          branding={branding}
          onOpenDesigner={() => {
            setSelectedFormForDesigner(selectedFormForPdf);
            setDesignerOpen(true);
          }}
        />
      )}
      {designerOpen && selectedFormForDesigner && (
        <ErrorBoundary
          title="طراح قالب‌های چاپ کارتابل"
          onClose={() => setDesignerOpen(false)}
        >
          <PrintTemplateDesignerModal
            isOpen={designerOpen}
            onClose={() => setDesignerOpen(false)}
            form={selectedFormForDesigner}
            branding={branding}
            onSave={(newTemplates) => {
              if (Array.isArray(newTemplates)) {
                const mergeTemplates = (formObj) => {
                  if (!formObj) return formObj;
                  try {
                    const raw = formObj.schemaJson || formObj.SchemaJSON;
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
                    parsed.printTemplates = newTemplates;
                    const updatedJson = JSON.stringify(parsed);
                    return { ...formObj, schemaJson: updatedJson, SchemaJSON: updatedJson };
                  } catch {
                    return formObj;
                  }
                };
                setSelectedFormForPdf((prev) => mergeTemplates(prev));
                setSelectedFormForDesigner((prev) => mergeTemplates(prev));
              }
              if (onRefresh) onRefresh();
            }}
          />
        </ErrorBoundary>
      )}
    </>
  );
  // فیلترهای کارتابل ورودی (Inbox)
  const [inboxStatusFilter, setInboxStatusFilter] = useState('Pending'); // پیش‌فرض: در انتظار تایید
  const [inboxFormFilter, setInboxFormFilter] = useState('ALL');
  const [inboxApplicantFilter, setInboxApplicantFilter] = useState('ALL');
  const [inboxFromDate, setInboxFromDate] = useState('');
  const [inboxToDate, setInboxToDate] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [expandedInboxIds, setExpandedInboxIds] = useState(new Set());

  // فیلترهای پیگیری درخواست‌ها (Outbox)
  const [outboxStatusFilter, setOutboxStatusFilter] = useState('ALL');
  const [outboxFormFilter, setOutboxFormFilter] = useState('ALL');
  const [outboxFromDate, setOutboxFromDate] = useState('');
  const [outboxToDate, setOutboxToDate] = useState('');
  const [outboxSearch, setOutboxSearch] = useState('');
  const [selectedOutboxId, setSelectedOutboxId] = useState(null);

  // فیلترهای رونوشت‌های من (CC Inbox)
  const [ccFormFilter, setCcFormFilter] = useState('ALL');
  const [ccApplicantFilter, setCcApplicantFilter] = useState('ALL');
  const [ccFromDate, setCcFromDate] = useState('');
  const [ccToDate, setCcToDate] = useState('');
  const [ccSearch, setCcSearch] = useState('');
  const [expandedCcIds, setExpandedCcIds] = useState(new Set());

  // مودال ثبت اقدام (تایید یا رد با یادداشت)
  const [actionModal, setActionModal] = useState(null); // { item, action: 'Approve' | 'Reject', comment: '' }
  const [transitioning, setTransitioning] = useState(false);

  // همگام‌سازی درخواست جستجو یا باز کردن مستقیم پرونده از اسکنر بارکد موبایل
  useEffect(() => {
    if (!externalSearchRequest || !externalSearchRequest.nonce) return;
    const targetTab = externalSearchRequest.tab || activeTab;
    const query = externalSearchRequest.query || '';

    if (targetTab === 'inbox') {
      setInboxStatusFilter('ALL');
      setInboxFormFilter('ALL');
      setInboxApplicantFilter('ALL');
      setInboxFromDate('');
      setInboxToDate('');
      setInboxSearch(query);
      if (externalSearchRequest.expandSubmissionId) {
        setExpandedInboxIds((prev) => {
          const next = new Set(prev);
          next.add(externalSearchRequest.expandSubmissionId);
          return next;
        });
      }
    } else if (targetTab === 'outbox') {
      setOutboxStatusFilter('ALL');
      setOutboxFormFilter('ALL');
      setOutboxFromDate('');
      setOutboxToDate('');
      setOutboxSearch(query);
      if (externalSearchRequest.selectSubmissionId) {
        setSelectedOutboxId(externalSearchRequest.selectSubmissionId);
      }
    } else if (targetTab === 'cc-inbox') {
      setCcFormFilter('ALL');
      setCcApplicantFilter('ALL');
      setCcFromDate('');
      setCcToDate('');
      setCcSearch(query);
      if (externalSearchRequest.expandSubmissionId) {
        setExpandedCcIds((prev) => {
          const next = new Set(prev);
          next.add(externalSearchRequest.expandSubmissionId);
          return next;
        });
      }
    }

    const focusId = externalSearchRequest.expandSubmissionId || externalSearchRequest.selectSubmissionId;
    if (focusId && typeof document !== 'undefined') {
      setTimeout(() => {
        const el = document.querySelector(`[data-submission-card="${CSS.escape(String(focusId))}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [externalSearchRequest, activeTab]);

  // گزینه‌های متمایز عنوان فرم و متقاضی برای فیلترها
  const distinctInboxForms = useMemo(() => Array.from(new Set(inbox.map(i => i.formTitle).filter(Boolean))), [inbox]);
  const distinctInboxApplicants = useMemo(() => Array.from(new Set(inbox.map(i => i.submittedByUserName).filter(Boolean))), [inbox]);

  const distinctOutboxForms = useMemo(() => Array.from(new Set(outbox.map(i => i.formTitle).filter(Boolean))), [outbox]);
  const distinctCcForms = useMemo(() => Array.from(new Set(ccInbox.map(i => i.formTitle).filter(Boolean))), [ccInbox]);
  const distinctCcApplicants = useMemo(() => Array.from(new Set(ccInbox.map(i => i.submittedByUserName).filter(Boolean))), [ccInbox]);

  // فیلتر داده‌های کارتابل ورودی
  const filteredInbox = useMemo(() => {
    return inbox.filter(item => {
      const actionState = (item.actionState || 'Pending').toLowerCase();

      // ۱. وضعیت اقدام در کارتابل
      if (inboxStatusFilter !== 'ALL') {
        if (actionState !== inboxStatusFilter.toLowerCase()) return false;
      }

      // ۲. عنوان فرم
      if (inboxFormFilter !== 'ALL' && item.formTitle !== inboxFormFilter) {
        return false;
      }

      // ۳. متقاضی
      if (inboxApplicantFilter !== 'ALL' && item.submittedByUserName !== inboxApplicantFilter) {
        return false;
      }

      // ۴. بازه تاریخ شمسی
      const itemDate = toPersianDateOnly(item.submittedAt);
      if (inboxFromDate && itemDate < inboxFromDate) return false;
      if (inboxToDate && itemDate > inboxToDate) return false;

      // ۵. جستجوی متنی (کد رهگیری، نام متقاضی یا محتوای فرم)
      if (inboxSearch.trim()) {
        const q = inboxSearch.trim().toLowerCase();
        const tracking = (item.trackingCode || '').toLowerCase();
        const submitter = (item.submittedByUserName || '').toLowerCase();
        const formTitle = (item.formTitle || '').toLowerCase();
        const dataJson = (item.formDataJson || '').toLowerCase();
        if (!tracking.includes(q) && !submitter.includes(q) && !formTitle.includes(q) && !dataJson.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [inbox, inboxStatusFilter, inboxFormFilter, inboxApplicantFilter, inboxFromDate, inboxToDate, inboxSearch]);

  // فیلتر داده‌های Outbox
  const filteredOutbox = useMemo(() => {
    return outbox.filter(item => {
      const status = item.workflowStatus || '';

      // ۱. فیلتر وضعیت
      if (outboxStatusFilter === 'IN_PROGRESS') {
        if (status === 'Approved' || status === 'Completed' || status === 'Rejected') return false;
      } else if (outboxStatusFilter === 'APPROVED') {
        if (status !== 'Approved' && status !== 'Completed') return false;
      } else if (outboxStatusFilter === 'REJECTED') {
        if (status !== 'Rejected') return false;
      }

      // ۲. عنوان فرم
      if (outboxFormFilter !== 'ALL' && item.formTitle !== outboxFormFilter) {
        return false;
      }

      // ۳. بازه تاریخ شمسی
      const itemDate = toPersianDateOnly(item.submittedAt);
      if (outboxFromDate && itemDate < outboxFromDate) return false;
      if (outboxToDate && itemDate > outboxToDate) return false;

      // ۴. جستجوی کد رهگیری و متنی
      if (outboxSearch.trim()) {
        const q = outboxSearch.trim().toLowerCase();
        const tracking = (item.trackingCode || '').toLowerCase();
        const formTitle = (item.formTitle || '').toLowerCase();
        const dataJson = (item.formDataJson || '').toLowerCase();
        if (!tracking.includes(q) && !formTitle.includes(q) && !dataJson.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [outbox, outboxStatusFilter, outboxFormFilter, outboxFromDate, outboxToDate, outboxSearch]);

  // فیلتر داده‌های رونوشت‌های من (CC Inbox)
  const filteredCcInbox = useMemo(() => {
    return ccInbox.filter(item => {
      // ۱. عنوان فرم
      if (ccFormFilter !== 'ALL' && item.formTitle !== ccFormFilter) {
        return false;
      }

      // ۲. متقاضی
      if (ccApplicantFilter !== 'ALL' && item.submittedByUserName !== ccApplicantFilter) {
        return false;
      }

      // ۳. بازه تاریخ شمسی
      const itemDate = toPersianDateOnly(item.submittedAt);
      if (ccFromDate && itemDate < ccFromDate) return false;
      if (ccToDate && itemDate > ccToDate) return false;

      // ۴. جستجوی متنی
      if (ccSearch.trim()) {
        const q = ccSearch.trim().toLowerCase();
        const tracking = (item.trackingCode || '').toLowerCase();
        const submitter = (item.submittedByUserName || '').toLowerCase();
        const formTitle = (item.formTitle || '').toLowerCase();
        const dataJson = (item.formDataJson || '').toLowerCase();
        if (!tracking.includes(q) && !submitter.includes(q) && !formTitle.includes(q) && !dataJson.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [ccInbox, ccFormFilter, ccApplicantFilter, ccFromDate, ccToDate, ccSearch]);

  const toggleInboxExpanded = (submissionId) => {
    setExpandedInboxIds(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  };

  const toggleCcExpanded = (submissionId) => {
    setExpandedCcIds(prev => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  };

  const handleConfirmAction = async () => {
    if (!actionModal) return;
    try {
      setTransitioning(true);
      if (onTransition) {
        await onTransition(actionModal.item.submissionId, actionModal.action, actionModal.comment);
      }
      setActionModal(null);
    } finally {
      setTransitioning(false);
    }
  };

  // رندر تب کارتابل ورودی (Inbox)
  if (activeTab === 'inbox') {
    return (
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-2.5 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5">
        {/* هدر بخش کارتابل */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/80">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-white shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                کارتابل ورودی وظایف
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                بررسی و تصمیم‌گیری روی درخواست‌های ارجاعی، و مشاهده سوابق اقدام‌شده.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenDelegationModal && (
              <button
                type="button"
                onClick={onOpenDelegationModal}
                className="flex items-center gap-1.5 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-[#333645] dark:hover:bg-[#3e4254] text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-xl font-medium transition cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>تفویض کارتابل (جانشین)</span>
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="تازه‌سازی کارتابل"
                aria-label="تازه‌سازی کارتابل ورودی"
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* بنر تایید فرم‌های جدید برای ادمین */}
        {user?.roles?.includes('Admin') && forms.filter(f => f.status === 'PendingApproval').length > 0 && (
          <div className="bg-indigo-50 dark:bg-[#232536] border border-indigo-200 dark:border-slate-700/80 text-indigo-900 dark:text-indigo-200 p-4 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <span className="font-bold block">
                  یادآور حاکمیت فرم‌ها: {forms.filter(f => f.status === 'PendingApproval').length} فرم جدید در انتظار تایید شماست.
                </span>
                <span className="text-[11px] text-indigo-700 dark:text-indigo-300">
                  جهت انتشار عمومی فرم‌ها به کاتالوگ فرم‌ها مراجعه فرمایید.
                </span>
              </div>
            </div>
            {onNavigateToForms && (
              <button
                type="button"
                onClick={onNavigateToForms}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition shrink-0 shadow-xs cursor-pointer"
              >
                بررسی در کاتالوگ فرم‌ها
              </button>
            )}
          </div>
        )}

        {/* هشدار تفویض فعال */}
        {activeDelegation && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200 p-3.5 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>کارتابل شما به کاربر جانشین تفویض شده است (تا تاریخ: <b>{activeDelegation.endDate || 'نامحدود'}</b>)</span>
            </div>
            {onCancelDelegation && (
              <button
                type="button"
                onClick={onCancelDelegation}
                className="text-rose-600 dark:text-rose-400 hover:underline font-bold cursor-pointer"
              >
                لغو تفویض
              </button>
            )}
          </div>
        )}

        {/* نوار فیلترهای جامع کارتابل ورودی */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>فیلتر و جستجوی کارتابل ورودی</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setInboxStatusFilter('Pending');
                setInboxFormFilter('ALL');
                setInboxApplicantFilter('ALL');
                setInboxFromDate('');
                setInboxToDate('');
                setInboxSearch('');
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>بازنشانی فیلترها</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* وضعیت اقدام (پیش‌فرض: در انتظار تایید) */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">وضعیت اقدام:</label>
              <select
                value={inboxStatusFilter}
                onChange={(e) => setInboxStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Pending">در انتظار تایید (اقدام شما)</option>
                <option value="Approved">تایید شده توسط شما / گروه</option>
                <option value="Rejected">رد شده توسط شما / گروه</option>
                <option value="ALL">همه وضعیت‌ها</option>
              </select>
            </div>

            {/* عنوان فرم */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">عنوان فرم:</label>
              <select
                value={inboxFormFilter}
                onChange={(e) => setInboxFormFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه فرم‌ها</option>
                {distinctInboxForms.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* متقاضی */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">متقاضی (نفر):</label>
              <select
                value={inboxApplicantFilter}
                onChange={(e) => setInboxApplicantFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه متقاضیان</option>
                {distinctInboxApplicants.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            {/* کادر جستجوی متنی (عرض دو برابر) */}
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">جستجو:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="جستجوی متنی در کد رهگیری، متقاضی یا محتوای فیلدهای فرم..."
                  className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* از تاریخ ثبت */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">از تاریخ ثبت:</label>
              <PersianDatePicker
                value={inboxFromDate}
                onChange={setInboxFromDate}
                placeholder="از تاریخ..."
              />
            </div>

            {/* تا تاریخ ثبت */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">تا تاریخ ثبت:</label>
              <PersianDatePicker
                value={inboxToDate}
                onChange={setInboxToDate}
                placeholder="تا تاریخ..."
              />
            </div>
          </div>
        </div>

        {/* لیست آیتم‌های کارتابل ورودی با اسکرول عمودی و کارت‌های آکاردئونی فشرده */}
        {filteredInbox.length === 0 ? (
          <EmptyCartable3D message="موردی با مشخصات فیلترهای انتخابی در کارتابل ورودی یافت نشد." />
        ) : (
          <div className="space-y-3 max-h-none md:max-h-[620px] overflow-visible md:overflow-y-auto md:pr-1">
            {filteredInbox.map((item) => {
              const currentId = item.submissionID || item.submissionId;
              const isExpanded = expandedInboxIds.has(currentId);
              const state = (item.actionState || 'Pending').toLowerCase();
              const isPending = state === 'pending';
              const isApproved = state === 'approved';
              const isRejected = state === 'rejected';

              return (
                <div
                  key={currentId}
                  data-submission-card={currentId}
                  className={`border rounded-2xl transition cursor-pointer select-none overflow-hidden ${
                    isExpanded
                      ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-xs'
                      : isPending
                      ? 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1e2030] shadow-2xs'
                      : 'border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/40 dark:bg-[#1e2030]/70 shadow-2xs'
                  }`}
                  onClick={() => toggleInboxExpanded(currentId)}
                >
                  {/* ردیف فشرده کارت در حالت عادی */}
                  <div className="p-3 sm:p-5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base">{item.formTitle}</span>
                        <span dir="ltr" className="text-xs bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono font-medium whitespace-nowrap">
                          {item.trackingCode}
                        </span>
                        {item.currentStepName && (
                          <span className="text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 px-2.5 py-0.5 rounded-full font-bold">
                            گام: {item.currentStepName}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>متقاضی: <b className="text-slate-700 dark:text-slate-200">{item.submittedByUserName}</b></span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-mono" dir="ltr">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {toPersianDateTime(item.submittedAt)}
                        </span>
                        {item.completedAt && (
                          <>
                            <span>•</span>
                            <span className="text-slate-400 text-[11px]">
                              تکمیل: <bdi dir="ltr">{toPersianDateTime(item.completedAt)}</bdi>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {isPending && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 whitespace-nowrap">
                          <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          در انتظار اقدام شما
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 whitespace-nowrap">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          تایید شده توسط شما / گروه
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 whitespace-nowrap">
                          <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          رد شده توسط شما / گروه
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPdfForItem(item);
                        }}
                        className={`p-1.5 rounded-xl border transition flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                        }`}
                        title={
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'پیش‌نمایش و صدور PDF'
                            : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                        }
                      >
                        <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span className="hidden sm:inline">PDF</span>
                      </button>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* جزئیات کامل فرم هنگام کلیک و باز شدن کارت */}
                  {isExpanded && (
                    <div
                      className="p-2.5 sm:p-5 pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] animate-in fade-in duration-200 cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">اطلاعات و محتوای ثبت‌شده در فرم:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPdfForItem(item);
                            }}
                            className={`px-2.5 py-1 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                            }`}
                            title={
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'پیش‌نمایش و صدور برگه رسمی A4 / A5'
                                : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>خروجی PDF</span>
                          </button>
                          <span className="text-[11px] text-slate-400 font-mono">وضعیت فرآیند: {item.workflowStatus}</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <FormViewer
                          formDataJson={item.formDataJson}
                          formsList={forms}
                          formTitle={item.formTitle}
                          formSchemaJson={item.formSchemaJson}
                        />
                      </div>

                      {/* دکمه‌های تایید / رد فقط و فقط برای درخواست‌های در انتظار تایید */}
                      {isPending && (
                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/80">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ item, action: 'Reject', comment: '' });
                            }}
                            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs px-4 py-2 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>رد کردن</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ item, action: 'Approve', comment: '' });
                            }}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-5 py-2 rounded-xl font-bold transition shadow-xs cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>تایید درخواست</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* مودال ثبت اقدام تایید/رد به همراه یادداشت توضیحی */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#252736] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200 dark:border-slate-700/80">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/80">
                <h4 className="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  {actionModal.action === 'Approve' ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <span>تایید و تصویب درخواست</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                      <span>رد درخواست</span>
                    </>
                  )}
                </h4>
                <span dir="ltr" className="text-xs font-mono text-slate-400">{actionModal.item.trackingCode}</span>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <p>عنوان فرم: <b className="text-slate-800 dark:text-slate-100">{actionModal.item.formTitle}</b></p>
                <p>متقاضی: <b className="text-slate-800 dark:text-slate-100">{actionModal.item.submittedByUserName}</b></p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  یادداشت و توضیحات (اختیاری):
                </label>
                <textarea
                  rows={3}
                  value={actionModal.comment}
                  onChange={(e) => setActionModal({ ...actionModal, comment: e.target.value })}
                  placeholder={actionModal.action === 'Approve' ? 'توضیحات تایید (اختیاری)...' : 'دلیل رد درخواست را بنویسید...'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  disabled={transitioning}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  disabled={transitioning}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    actionModal.action === 'Approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {transitioning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{actionModal.action === 'Approve' ? 'تایید نهایی' : 'ثبت رد درخواست'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
        {renderModals()}
      </div>
    );
  }

  // رندر تب پیگیری درخواست‌ها (Outbox)
  if (activeTab === 'outbox') {
    return (
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-2.5 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/80">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg text-white shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                درخواست‌های ثبت‌شده توسط شما (Outbox)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                مشاهده وضعیت لحظه‌ای، تایم‌لاین گردش‌کار و تاییدات درخواست‌های ثبت‌شده.
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="تازه‌سازی لیست درخواست‌ها"
              aria-label="تازه‌سازی کارتابل پیگیری درخواست‌ها"
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* نوار فیلتر Outbox */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>فیلتر و جستجوی درخواست‌ها</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setOutboxStatusFilter('ALL');
                setOutboxFormFilter('ALL');
                setOutboxFromDate('');
                setOutboxToDate('');
                setOutboxSearch('');
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>بازنشانی فیلترها</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* وضعیت درخواست */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">وضعیت فرآیند:</label>
              <select
                value={outboxStatusFilter}
                onChange={(e) => setOutboxStatusFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه وضعیت‌ها</option>
                <option value="IN_PROGRESS">در جریان (در انتظار تاییدات)</option>
                <option value="APPROVED">تایید نهایی / مختومه</option>
                <option value="REJECTED">رد شده</option>
              </select>
            </div>

            {/* عنوان فرم */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">عنوان فرم:</label>
              <select
                value={outboxFormFilter}
                onChange={(e) => setOutboxFormFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه فرم‌ها</option>
                {distinctOutboxForms.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">جستجو:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={outboxSearch}
                  onChange={(e) => setOutboxSearch(e.target.value)}
                  placeholder="جستجوی کد رهگیری، عنوان فرم یا محتوای ثبت‌شده..."
                  className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* از تاریخ */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">از تاریخ ثبت:</label>
              <PersianDatePicker
                value={outboxFromDate}
                onChange={setOutboxFromDate}
                placeholder="از تاریخ..."
              />
            </div>

            {/* تا تاریخ */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">تا تاریخ ثبت:</label>
              <PersianDatePicker
                value={outboxToDate}
                onChange={setOutboxToDate}
                placeholder="تا تاریخ..."
              />
            </div>
          </div>
        </div>

        {/* لیست کارتهای آکاردئونی Outbox */}
        {filteredOutbox.length === 0 ? (
          <EmptyCartable3D message="درخواستی مطابق فیلترهای انتخابی در کارتابل پیگیری درخواست‌ها یافت نشد." />
        ) : (
          <div className="space-y-3 max-h-none md:max-h-[620px] overflow-visible md:overflow-y-auto md:pr-1">
            {filteredOutbox.map((item) => {
              const currentId = item.submissionID || item.submissionId;
              const isSelected = selectedOutboxId === currentId;
              const isApproved = item.workflowStatus === 'Approved' || item.workflowStatus === 'Completed';
              const isRejected = item.workflowStatus === 'Rejected';
              const hasOpenPopover = openPopoverStepKey != null && openPopoverStepKey.startsWith(`${currentId}_`);

              return (
                <div
                  key={currentId}
                  data-submission-card={currentId}
                  className={`border rounded-2xl p-2.5 sm:p-5 transition cursor-pointer select-none overflow-visible relative ${
                    hasOpenPopover
                      ? 'z-30 border-indigo-600 shadow-md bg-indigo-50/20 dark:bg-indigo-950/30'
                      : isSelected
                      ? 'z-10 border-indigo-600 shadow-md bg-indigo-50/20 dark:bg-indigo-950/30'
                      : 'z-10 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1e2030]'
                  }`}
                  onClick={() => setSelectedOutboxId(isSelected ? null : currentId)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-base">{item.formTitle}</div>
                      <div className="text-xs text-slate-400 mt-1 font-mono flex flex-wrap items-center gap-2">
                        <span>کد رهگیری: <b dir="ltr" className="inline-block text-slate-600 dark:text-slate-300">{item.trackingCode}</b></span>
                        <span>•</span>
                        <span dir="ltr" className="inline-block">{toPersianDateTime(item.submittedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPdfForItem(item);
                        }}
                        className={`p-1.5 rounded-xl border transition flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                        }`}
                        title={
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'پیش‌نمایش و صدور PDF'
                            : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                        }
                      >
                        <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span className="hidden sm:inline">PDF</span>
                      </button>

                      <span className={`text-xs px-3 py-1 rounded-full font-bold border whitespace-nowrap ${
                        isApproved ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' :
                        isRejected ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30'
                      }`}>
                        {item.workflowStatus === 'Completed' ? 'تکمیل‌شده (مختومه)' :
                         item.workflowStatus === 'Approved' ? 'تصویب نهایی' :
                         item.workflowStatus === 'Rejected' ? 'رد شده' :
                         item.workflowStatus?.startsWith('PendingStep_') ? `در انتظار تایید • ${item.workflowStatus.includes(':') ? item.workflowStatus.split(':')[1].trim() : item.workflowStatus}` :
                         item.workflowStatus}
                      </span>
                      {isSelected ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* جزییات و تایم‌لاین بصری فشرده مطابق الگوی مدرن Jira */}
                  {isSelected && (
                    <div className="mt-5 pt-4 border-t border-slate-200/80 animate-in fade-in duration-200 overflow-visible">
                      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-xl text-white overflow-visible relative" dir="rtl">
                        <div className="text-xs font-bold text-slate-200 mb-5 flex items-center justify-between">
                          <span>مسیر گردش‌کار و وضعیت تاییدات</span>
                        </div>

                        <div className="flex items-start justify-between relative px-2 overflow-visible">
                          {/* خط اتصال زمینه */}
                          <div className="absolute top-5 left-10 right-10 h-0.5 bg-slate-700 -z-0" />

                          {/* گره شروع (سمت راست): ثبت درخواست */}
                          <div className="flex flex-col items-center text-center shrink-0 min-w-[90px] z-10">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                              <Check className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <span className="text-xs font-bold text-slate-200 mt-2">ثبت درخواست</span>
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">{toPersianTimeOnly(item.submittedAt)}</span>
                          </div>

                          {/* گره‌های میانی: به ازای هر مرحله در item.stepsProgress */}
                          {(item.stepsProgress || []).map((step, sIdx) => {
                            const stepKey = `${item.submissionId || item.submissionID}_${sIdx}`;
                            const isPopoverOpen = openPopoverStepKey === stepKey;
                            const isStepCompleted = step.status === 'Completed';
                            const isStepActive = step.status === 'Active';
                            const isStepRejected = step.status === 'Rejected';
                            const isStepSkipped = step.status === 'Skipped';
                            const isStepPending = step.status === 'Pending';

                            return (
                              <div
                                key={sIdx}
                                className="relative flex flex-col items-center text-center shrink-0 min-w-[110px] max-w-[150px] cursor-pointer group z-10 overflow-visible"
                                data-popover-trigger
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenPopoverStepKey(isPopoverOpen ? null : stepKey);
                                }}
                              >
                                {/* آیکن وضعیت بالای گره */}
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                                  isStepCompleted ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10 hover:scale-105' :
                                  isStepActive ? 'bg-blue-600/30 border-2 border-blue-500 text-blue-400 ring-4 ring-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:scale-105' :
                                  isStepRejected ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-400 hover:scale-105' :
                                  isStepSkipped ? 'bg-slate-800/70 border-2 border-dashed border-slate-600 text-slate-400 hover:scale-105' :
                                  'bg-slate-800 border-2 border-slate-700 text-slate-500'
                                }`}>
                                  {isStepCompleted ? <Check className="w-5 h-5 stroke-[2.5]" /> :
                                   isStepActive ? <Clock className="w-5 h-5 stroke-[2.5] animate-pulse" /> :
                                   isStepRejected ? <XCircle className="w-5 h-5 stroke-[2.5]" /> :
                                   isStepSkipped ? <span className="text-base font-bold select-none leading-none">↶</span> :
                                   <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />}
                                </div>

                                {/* عنوان مرحله زیر آیکن */}
                                <span className="text-xs font-bold text-slate-200 mt-2 truncate max-w-[120px] group-hover:text-blue-400 transition-colors" title={step.stepName}>
                                  {step.stepName}
                                </span>

                                {/* بج قرصی شمارنده اجماع یا عدم احراز شرط زیر عنوان */}
                                <div>
                                  {isStepSkipped ? (
                                    <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/50 text-slate-300 border border-slate-600/60 inline-block">
                                      عدم احراز شرط (عبور)
                                    </span>
                                  ) : isStepCompleted ? (
                                    <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-block">
                                      {toPersianDigits(step.approvedCount)} از {toPersianDigits(step.requiredCount)}
                                    </span>
                                  ) : isStepActive ? (
                                    <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 inline-block">
                                      {toPersianDigits(step.approvedCount)} از {toPersianDigits(step.requiredCount)}
                                    </span>
                                  ) : (
                                    <span className="mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800/90 text-slate-400 border border-slate-700/80 inline-block">
                                      {toPersianDigits(step.approvedCount)} از {toPersianDigits(step.requiredCount)}
                                    </span>
                                  )}
                                </div>

                                {/* پشته آواتارهای روی‌هم (Avatar Stack) */}
                                {step.approvers && step.approvers.length > 0 && (
                                  <div className="flex items-center justify-center -space-x-2 space-x-reverse mt-1.5">
                                    {step.approvers.slice(0, 3).map((app, aIdx) => {
                                      const isMuted = app.status === 'NotRequired' || app.status === 'Skipped';
                                      const statusText =
                                        app.status === 'Approved' ? 'تایید شده' :
                                        app.status === 'Rejected' ? 'رد شده' :
                                        app.status === 'NotRequired' ? 'عدم نیاز به اقدام' :
                                        app.status === 'Skipped' ? 'عبور از مرحله' :
                                        isStepActive ? 'در انتظار' : 'در نوبت تایید';

                                      return (
                                        <div
                                          key={app.userId || aIdx}
                                          title={`${app.fullName} (${statusText})`}
                                          className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center border-2 border-slate-900 shadow-sm select-none transition-transform hover:scale-110 z-10 ${
                                            app.status === 'Approved' ? 'bg-emerald-600 text-white' :
                                            app.status === 'Rejected' ? 'bg-rose-600 text-white' :
                                            isMuted ? 'bg-slate-800 text-slate-400 opacity-55' :
                                            'bg-slate-700 text-slate-200'
                                          }`}
                                        >
                                          {app.initials || '؟'}
                                        </div>
                                      );
                                    })}
                                    {step.approvers.length > 3 && (
                                      <div className="w-7 h-7 rounded-full border-2 border-slate-900 bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold select-none z-0">
                                        +{toPersianDigits(step.approvers.length - 3)}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* پاپ‌آپ شناور جزئیات تاییدکنندگان */}
                                {isPopoverOpen && (
                                  <div
                                    data-step-popover
                                    className="absolute top-full mt-3 z-50 min-w-[240px] max-w-[300px] p-3.5 bg-slate-900 border border-slate-700 text-white rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-right cursor-default"
                                    style={{ right: '50%', transform: 'translateX(50%)' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-bold">
                                      <span className="text-slate-200 truncate max-w-[150px]">{step.stepName}</span>
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        {step.approvalRule === 'ALL' ? 'تایید همه (اجماعی)' : 'تایید یکی از اعضا'}
                                      </span>
                                    </div>

                                    {/* توضیح عدم احراز شروط برای مرحله پرش شده */}
                                    {isStepSkipped && (
                                      <div className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/40 rounded-lg px-2.5 py-1.5 mb-2 leading-relaxed">
                                        شروط ورود به این مرحله احراز نشد و فرآیند از آن عبور کرد.
                                      </div>
                                    )}

                                    <div className="space-y-2 max-h-52 overflow-y-auto">
                                      {step.approvers && step.approvers.length > 0 ? (
                                        step.approvers.map((app) => (
                                          <div key={app.userId} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-800/60 last:border-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className={`text-xs ${
                                                app.status === 'Approved' ? 'text-emerald-400' :
                                                app.status === 'Rejected' ? 'text-rose-400' :
                                                app.status === 'NotRequired' || app.status === 'Skipped' ? 'text-slate-400' :
                                                isStepActive ? 'text-amber-400' : 'text-slate-400'
                                              }`}>
                                                {app.status === 'Approved' ? '✓' :
                                                 app.status === 'Rejected' ? '✕' :
                                                 app.status === 'NotRequired' ? '—' :
                                                 app.status === 'Skipped' ? '↶' :
                                                 isStepActive ? '⏳' : '🕒'}
                                              </span>
                                              <span className={`truncate text-xs ${
                                                app.status === 'Approved' ? 'text-slate-200' :
                                                app.status === 'Rejected' ? 'text-rose-300' :
                                                app.status === 'NotRequired' || app.status === 'Skipped' ? 'text-slate-400' :
                                                isStepActive ? 'text-amber-300' : 'text-slate-300'
                                              }`}>
                                                {app.fullName}
                                              </span>
                                            </div>
                                            <span className={`shrink-0 text-[10px] font-mono ${
                                              app.status === 'Approved' ? 'text-emerald-400' :
                                              app.status === 'Rejected' ? 'text-rose-400' :
                                              app.status === 'NotRequired' || app.status === 'Skipped' ? 'text-slate-400' :
                                              isStepActive ? 'text-amber-300' : 'text-slate-400'
                                            }`}>
                                              {app.status === 'Approved' ? (app.actionAt ? toPersianTimeOnly(app.actionAt) : 'تایید شده') :
                                               app.status === 'Rejected' ? (app.actionAt ? toPersianTimeOnly(app.actionAt) : 'رد شده') :
                                               app.status === 'NotRequired' ? 'عدم نیاز به اقدام' :
                                               app.status === 'Skipped' ? 'عبور از مرحله' :
                                               isStepActive ? '(در انتظار)' : '(در نوبت تایید)'}
                                            </span>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-xs text-slate-400 py-1 text-center">بدون تاییدکننده مشخص</div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* گره پایان (سمت چپ): پایان فرآیند */}
                          <div className="flex flex-col items-center text-center shrink-0 min-w-[90px] z-10">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                              isApproved ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/10' :
                              isRejected ? 'bg-rose-500/20 border-2 border-rose-500 text-rose-400 shadow-lg shadow-rose-500/10' :
                              'bg-slate-800 border-2 border-slate-700 text-slate-500'
                            }`}>
                              {isApproved ? <Check className="w-5 h-5 stroke-[2.5]" /> :
                               isRejected ? <XCircle className="w-5 h-5 stroke-[2.5]" /> :
                               <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />}
                            </div>
                            <span className="text-xs font-bold text-slate-200 mt-2">پایان فرآیند</span>
                            <span className={`text-[10px] mt-0.5 font-bold ${
                              isApproved ? 'text-emerald-400' :
                              isRejected ? 'text-rose-400' : 'text-slate-400'
                            }`}>
                              {isApproved ? 'مختومه' : isRejected ? 'رد شده' : 'در جریان'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isRejected && item.lastComment && (
                        <div className="mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 bg-rose-50 border-rose-200 text-rose-800">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                          <div>
                            <span className="font-bold block mb-0.5">دلیل رد درخواست:</span>
                            <p className="leading-relaxed">{item.lastComment}</p>
                          </div>
                        </div>
                      )}

                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-600 block">اطلاعات ارسال‌شده:</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPdfForItem(item);
                            }}
                            className={`px-2.5 py-1 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 shadow-2xs'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                            title={
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'پیش‌نمایش و صدور برگه رسمی A4 / A5'
                                : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600" />
                            <span>خروجی PDF</span>
                          </button>
                        </div>
                        <FormViewer
                          formDataJson={item.formDataJson}
                          formsList={forms}
                          formTitle={item.formTitle}
                          formSchemaJson={item.formSchemaJson}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {renderModals()}
      </div>
    );
  }

  // رندر تب رونوشت‌های من (CC Inbox) با ساختار آکاردئونی فشرده و یکپارچه
  if (activeTab === 'cc-inbox') {
    return (
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-2.5 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/80">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg text-white shrink-0">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                رونوشت‌های سازمانی ارجاعی به من (CC Inbox)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                مشاهده محتوای درخواست‌های ارجاعی به عنوان مطلع و ناظر (فقط‌خواندنی، با کلیک روی هر کارت باز می‌شود).
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="تازه‌سازی کارتابل رونوشت‌ها"
              aria-label="تازه‌سازی کارتابل رونوشت‌ها"
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* نوار فیلتر رونوشت‌ها */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>فیلتر و جستجوی رونوشت‌ها</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setCcFormFilter('ALL');
                setCcApplicantFilter('ALL');
                setCcFromDate('');
                setCcToDate('');
                setCcSearch('');
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>بازنشانی فیلترها</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* عنوان فرم */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">عنوان فرم:</label>
              <select
                value={ccFormFilter}
                onChange={(e) => setCcFormFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه فرم‌ها</option>
                {distinctCcForms.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* متقاضی */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">متقاضی (نفر):</label>
              <select
                value={ccApplicantFilter}
                onChange={(e) => setCcApplicantFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">همه متقاضیان</option>
                {distinctCcApplicants.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">جستجو:</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ccSearch}
                  onChange={(e) => setCcSearch(e.target.value)}
                  placeholder="جستجوی کد رهگیری، متقاضی یا محتوای فیلدهای فرم رونوشت..."
                  className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* از تاریخ */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">از تاریخ ثبت:</label>
              <PersianDatePicker
                value={ccFromDate}
                onChange={setCcFromDate}
                placeholder="از تاریخ..."
              />
            </div>

            {/* تا تاریخ */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">تا تاریخ ثبت:</label>
              <PersianDatePicker
                value={ccToDate}
                onChange={setCcToDate}
                placeholder="تا تاریخ..."
              />
            </div>
          </div>
        </div>

        {/* لیست کارتهای آکاردئونی فشرده رونوشت‌ها */}
        {filteredCcInbox.length === 0 ? (
          <EmptyCartable3D message="هیچ رونوشتی مطابق فیلترهای انتخابی در کارتابل رونوشت‌ها یافت نشد." />
        ) : (
          <div className="space-y-3 max-h-none md:max-h-[620px] overflow-visible md:overflow-y-auto md:pr-1">
            {filteredCcInbox.map((item) => {
              const currentId = item.submissionID || item.submissionId;
              const isExpanded = expandedCcIds.has(currentId);

              return (
                <div
                  key={currentId}
                  data-submission-card={currentId}
                  className={`border rounded-2xl transition cursor-pointer select-none overflow-hidden ${
                    isExpanded ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-xs' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1e2030]'
                  }`}
                  onClick={() => toggleCcExpanded(currentId)}
                >
                  {/* ردیف فشرده کارت در حالت عادی */}
                  <div className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{item.formTitle}</span>
                      <span dir="ltr" className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full font-mono whitespace-nowrap">
                        {item.trackingCode}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>متقاضی: <b className="text-slate-700 dark:text-slate-200">{item.submittedByUserName}</b></span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenPdfForItem(item);
                        }}
                        className={`p-1.5 rounded-xl border transition flex items-center gap-1 text-[11px] font-medium cursor-pointer ${
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                        }`}
                        title={
                          getFormAndTemplatesForItem(item).hasPrintTemplates
                            ? 'پیش‌نمایش و صدور PDF'
                            : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                        }
                      >
                        <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span className="hidden sm:inline">PDF</span>
                      </button>

                      <span dir="ltr" className="font-mono text-xs text-slate-400 whitespace-nowrap">
                        {toPersianDateTime(item.submittedAt)}
                      </span>
                      <span className="text-[11px] bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-500/30 px-2.5 py-0.5 rounded-md font-semibold">
                        رونوشت (فقط‌خواندنی)
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* جزئیات کامل فرم هنگام کلیک و باز شدن */}
                  {isExpanded && (
                    <div className="p-2.5 sm:p-5 pt-2.5 sm:pt-3 border-t border-slate-100 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] animate-in fade-in duration-200">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">جزئیات محتوای فرم رونوشت:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPdfForItem(item);
                            }}
                            className={`px-2.5 py-1 rounded-xl border transition flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
                            }`}
                            title={
                              getFormAndTemplatesForItem(item).hasPrintTemplates
                                ? 'پیش‌نمایش و صدور برگه رسمی A4 / A5'
                                : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                            <span>خروجی PDF</span>
                          </button>
                          <span className="text-[11px] text-slate-400 font-mono">وضعیت فرآیند: {item.workflowStatus}</span>
                        </div>
                      </div>
                      <FormViewer
                        formDataJson={item.formDataJson}
                        formsList={forms}
                        formTitle={item.formTitle}
                        formSchemaJson={item.formSchemaJson}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {renderModals()}
      </div>
    );
  }

  return null;
}
