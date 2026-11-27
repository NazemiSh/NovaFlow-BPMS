import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import {
  BarChart3, Download, Search, Printer, FileText,
  CheckSquare, Square, ChevronRight, ChevronLeft, X, Layers, Folder
} from 'lucide-react';
import { toPersianDateOnly, toPersianTimeOnly } from './PersianDatePicker';
import PrintTemplateDesignerModal from './PrintTemplateDesignerModal';
import PdfExportPreviewModal from './PdfExportPreviewModal';
import ErrorBoundary from './ErrorBoundary';
import { useDialog } from './GlobalDialogProvider';
import { evaluateRowFormula } from '../utils/formulaEvaluator';
import {
  useMasterDataResolver,
  preloadMasterDataForQuestions,
  resolveMasterValueFromStore
} from '../utils/masterDataResolver';

export default function ReportsTab({ forms = [], user = {}, branding = {}, onFormUpdated }) {
  const { toast } = useDialog();
  const [selectedReportTitle, setSelectedReportTitle] = useState('');
  const [selectedReportFormId, setSelectedReportFormId] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportStatusFilter, setReportStatusFilter] = useState('ALL');

  // انتخاب سطرها برای خروجی دسته‌ای در سراسر صفحات (Cross-Page Selection)
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState(new Set());

  // صفحه‌بندی سمت کلاینت
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // وضعیت مودال‌های طراح چاپ و پیش‌نمایش PDF
  const [designerOpen, setDesignerOpen] = useState(false);
  const [pdfExportModalOpen, setPdfExportModalOpen] = useState(false);
  const [targetPdfSubmissions, setTargetPdfSubmissions] = useState([]);

  const accessibleForms = useMemo(() => {
    return forms.filter(f => user.roles?.includes('Admin') || f.createdByUserID === user.userID || f.canViewReports);
  }, [forms, user]);

  const distinctFormTitles = useMemo(() => {
    return Array.from(new Set(accessibleForms.map(f => f.title)));
  }, [accessibleForms]);

  const versionsOfSelectedTitle = useMemo(() => {
    return accessibleForms.filter(f => f.title === selectedReportTitle);
  }, [accessibleForms, selectedReportTitle]);

  const fetchReportForFormId = async (formId) => {
    if (!formId) return;
    setReportLoading(true);
    setReportSearchTerm('');
    setReportStatusFilter('ALL');
    setSelectedSubmissionIds(new Set());
    setCurrentPage(1);
    try {
      const res = await api.get(`/forms/${formId}/submissions-report`);
      setReportData(res.data);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'خطا در دریافت گزارش پاسخ‌ها.');
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    if (distinctFormTitles.length > 0 && !selectedReportTitle) {
      const firstTitle = distinctFormTitles[0];
      setSelectedReportTitle(firstTitle);
      const firstVersions = accessibleForms.filter(f => f.title === firstTitle);
      if (firstVersions.length > 0) {
        setSelectedReportFormId(firstVersions[0].formID);
        fetchReportForFormId(firstVersions[0].formID);
      }
    }
  }, [distinctFormTitles, selectedReportTitle, accessibleForms]);

  const isFormFamilyPublic = (formTitle) => {
    return forms.some(f => f.title === formTitle && (
      f.isPublic || 
      (() => {
        try { return JSON.parse(f.schemaJson || '{}')?.isPublic === true; } catch (e) { return false; }
      })()
    ));
  };

  const isCurrentReportPublic = Boolean(
    reportData?.isPublic || 
    (() => {
      try { return JSON.parse(reportData?.schemaJSON || '{}')?.isPublic === true; } catch (e) { return false; }
    })() ||
    isFormFamilyPublic(reportData?.formTitle || selectedReportTitle)
  );

  // استخراج قالب‌های چاپ تعریف‌شده برای فرم انتخاب‌شده
  const currentPrintTemplates = useMemo(() => {
    if (reportData?.schemaJSON) {
      try {
        const parsed = JSON.parse(reportData.schemaJSON);
        if (Array.isArray(parsed.printTemplates)) return parsed.printTemplates;
      } catch (e) {}
    }
    const formObj = accessibleForms.find(f => f.formID === selectedReportFormId);
    if (formObj?.schemaJson) {
      try {
        const parsed = JSON.parse(formObj.schemaJson);
        if (Array.isArray(parsed.printTemplates)) return parsed.printTemplates;
      } catch (e) {}
    }
    return [];
  }, [reportData, accessibleForms, selectedReportFormId]);

  const hasPrintTemplates = currentPrintTemplates.length > 0;

  // استخراج متادیتای کامل فیلدهای گزارش (بدون سکشن‌های نمایشی و همراه با تنظیمات lookup)
  const reportQuestions = useMemo(() => {
    const list = [];
    if (!reportData?.schemaJSON) return list;
    try {
      const s = JSON.parse(reportData.schemaJSON);
      (s.sections || []).forEach(sec => {
        (sec.questions || []).forEach(q => {
          if (q && q.type !== 'section' && q.type !== 'sectionContainer' && q.type !== 'label') {
            list.push({
              ...q,
              id: q.id,
              label: q.label || q.id,
              unit: q.unit || '',
              type: q.type || 'text',
              columns: q.columns || []
            });
          }
        });
      });
    } catch (e) {}
    return list;
  }, [reportData]);

  const { resolveMasterValue } = useMasterDataResolver(reportQuestions);

  // فیلتر کردن پاسخ‌های ثبت‌شده
  let filteredSubmissions = [];
  if (reportData) {
    filteredSubmissions = (reportData.submissions || []).filter(sub => {
      if (reportStatusFilter !== 'ALL' && sub.workflowStatus !== reportStatusFilter) {
        return false;
      }
      if (reportSearchTerm.trim()) {
        const term = reportSearchTerm.toLowerCase();
        const matchesBase = 
          sub.trackingCode?.toLowerCase().includes(term) ||
          sub.submittedByUserName?.toLowerCase().includes(term);
        const matchesData = sub.dataJSON?.toLowerCase().includes(term);
        return matchesBase || matchesData;
      }
      return true;
    });
  }

  // محاسبه اقلام صفحه جاری
  const totalFiltered = filteredSubmissions.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const pagedSubmissions = filteredSubmissions.slice(startIndex, endIndex);

  // انتخاب / لغو انتخاب همه ردیف‌های صفحه جاری
  const isCurrentPageAllSelected = pagedSubmissions.length > 0 && pagedSubmissions.every(s => selectedSubmissionIds.has(s.submissionID));

  const handleToggleSelectPage = () => {
    const next = new Set(selectedSubmissionIds);
    if (isCurrentPageAllSelected) {
      pagedSubmissions.forEach(s => next.delete(s.submissionID));
    } else {
      pagedSubmissions.forEach(s => next.add(s.submissionID));
    }
    setSelectedSubmissionIds(next);
  };

  // انتخاب / لغو انتخاب یک ردیف (نگهداری در Set مستقل از صفحه)
  const handleToggleRowSelect = (subId) => {
    const next = new Set(selectedSubmissionIds);
    if (next.has(subId)) {
      next.delete(subId);
    } else {
      next.add(subId);
    }
    setSelectedSubmissionIds(next);
  };

  // ذخیره قالب‌ها در مودال طراح و به‌روزرسانی زنده
  const handleSaveDesignerTemplates = (newTemplates) => {
    if (reportData) {
      try {
        const parsed = JSON.parse(reportData.schemaJSON || '{}');
        parsed.printTemplates = newTemplates;
        setReportData({
          ...reportData,
          schemaJSON: JSON.stringify(parsed)
        });
      } catch (e) {}
    }
    if (onFormUpdated) {
      onFormUpdated();
    }
  };

  // خروجی استاندارد اکسل (CSV سطر به سطر تفکیک‌شده برای جداول اقلام پویا - Denormalized Export)
  const handleExportCsv = async () => {
    if (!reportData || !reportData.submissions || reportData.submissions.length === 0) {
      toast.warning('داده‌ای برای خروجی اکسل وجود ندارد.');
      return;
    }

    const masterStore = await preloadMasterDataForQuestions(reportQuestions);

    // تابع کمکی فرمت‌بندی سلول CSV با پشتیبانی از حفظ صفر ابتدایی اعداد (کد کالا، شماره موبایل، کد ملی و...) در اکسل
    const formatCsvCell = (val) => {
      if (val === undefined || val === null) return '""';
      let strVal = Array.isArray(val) ? val.join(' - ') : String(val);
      const trimmed = strVal.trim();
      // اگر مقدار با صفر شروع شود و فقط شامل ارقام باشد (مانند 000023 یا 09121234567)، برای حفظ صفر در اکسل با فرمت ="..." درج می‌شود
      if (/^0\d+$/.test(trimmed)) {
        return `="${trimmed}"`;
      }
      return `"${strVal.replace(/"/g, '""')}"`;
    };

    const resolveFieldForCsv = (fieldMeta, rawVal, rowContext = null, allCols = null) => {
      let val = rawVal;
      if ((val === undefined || val === null || val === '') && fieldMeta?.type === 'calculated' && fieldMeta?.formula && rowContext) {
        val = evaluateRowFormula(fieldMeta.formula, rowContext, allCols || []);
      }
      if (fieldMeta?.type === 'master_lookup') {
        return resolveMasterValueFromStore(masterStore, fieldMeta, val);
      }
      if (typeof val === 'boolean') return val ? 'بله' : 'خیر';
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return val.originalName || val.originalFileName || val.label || val.title || val.name || '';
      }
      return val;
    };

    const fileQuestionTypes = ['file', 'upload', 'attachment'];
    const fileQuestions = reportQuestions.filter(q => fileQuestionTypes.includes(q.type));
    const hasFileFields = fileQuestions.length > 0;

    const gridQuestions = reportQuestions.filter(
      q => ['repeater_grid', 'repeating_table', 'table'].includes(q.type) && Array.isArray(q.columns) && q.columns.length > 0
    );
    // برای فرم‌های دارای فیلد بارگذاری فایل، ستون‌های فایل به صورت مجزا درج نمی‌شوند تا به جای آن دو ستون تجمیعی در انتها قرار گیرد
    const regularQuestions = reportQuestions.filter(q => !gridQuestions.some(g => g.id === q.id) && !fileQuestionTypes.includes(q.type));

    const baseHeaders = ['کد رهگیری', 'وضعیت گردش کار', 'ثبت‌کننده', 'تاریخ ثبت', 'ساعت ثبت'];
    const regularHeaders = [];
    regularQuestions.forEach(q => {
      regularHeaders.push(`"${q.label.replace(/"/g, '""')}"`);
      if (q.unit) {
        regularHeaders.push(`"واحد [${q.label.replace(/"/g, '""')}]"`);
      }
    });

    const gridHeaders = [];
    gridQuestions.forEach(gq => {
      gridHeaders.push(`"ردیف قلم [${gq.label.replace(/"/g, '""')}]"`);
      gq.columns.forEach(col => {
        const colTitle = gridQuestions.length > 1 ? `[${gq.label}] ${col.label}` : col.label;
        gridHeaders.push(`"${colTitle.replace(/"/g, '""')}"`);
      });
    });

    // دو ستون اختصاصی و استاندارد برای مدیریت پیوست‌ها در اکسل
    const fileHeaders = hasFileFields ? ['"تعداد پیوست‌ها"', '"فایل‌های پیوست"'] : [];

    const allHeaders = [...baseHeaders, ...regularHeaders, ...gridHeaders, ...fileHeaders].join(',');

    // اگر مواردی با چک‌باکس انتخاب شده باشند، فقط همان‌ها صادر می‌شوند؛ در غیر این صورت همه فیلترشده‌ها
    const exportTargets = selectedSubmissionIds.size > 0
      ? reportData.submissions.filter(s => selectedSubmissionIds.has(s.submissionID))
      : filteredSubmissions;

    const rows = [];
    exportTargets.forEach(sub => {
      let answers = {};
      try {
        answers = JSON.parse(sub.dataJSON) || {};
      } catch (e) {}

      // محاسبه تعداد کل فایل‌های پیوست‌شده در پرونده
      let attachmentCount = 0;
      if (hasFileFields) {
        fileQuestions.forEach(fq => {
          const val = answers[fq.id];
          if (val) {
            if (Array.isArray(val)) {
              attachmentCount += val.filter(Boolean).length;
            } else if (typeof val === 'object' && val !== null) {
              attachmentCount += 1;
            } else if (typeof val === 'string' && val.trim()) {
              if (val.trim().startsWith('[')) {
                try {
                  const arr = JSON.parse(val);
                  if (Array.isArray(arr)) attachmentCount += arr.filter(Boolean).length;
                  else attachmentCount += 1;
                } catch {
                  attachmentCount += 1;
                }
              } else {
                attachmentCount += 1;
              }
            }
          }
        });
      }

      // تولید دو ستون تجمیعی پیوست‌ها
      const fileCols = [];
      if (hasFileFields) {
        // ستون ۱: تعداد پیوست‌ها به عنوان عدد خالص
        fileCols.push(String(attachmentCount));
        // ستون ۲: فرمول استاندارد هایپرلینک اکسل به پوشه فایل‌های پرونده
        if (attachmentCount > 0) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const folderUrl = `${origin}/attachments/${encodeURIComponent(sub.trackingCode || '')}`;
          fileCols.push(`"=HYPERLINK(""${folderUrl}"", ""مشاهده و دانلود پیوست‌ها"")"`);
        } else {
          fileCols.push('""');
        }
      }

      const baseCols = [
        formatCsvCell(sub.trackingCode || ''),
        formatCsvCell(translateWorkflowStatus(sub.workflowStatus || '')),
        formatCsvCell(sub.submittedByUserName || ''),
        formatCsvCell(toPersianDateOnly(sub.submittedAt)),
        formatCsvCell(toPersianTimeOnly(sub.submittedAt))
      ];

      const regularCols = [];
      regularQuestions.forEach(q => {
        regularCols.push(formatCsvCell(resolveFieldForCsv(q, answers[q.id])));
        if (q.unit) {
          regularCols.push(formatCsvCell(q.unit));
        }
      });

      if (gridQuestions.length === 0) {
        // بدون جدول اقلام: هر درخواست در یک سطر
        rows.push([...baseCols, ...regularCols, ...fileCols].join(','));
      } else {
        // دارای جدول اقلام: تولید سطر به سطر (Denormalized) برای اتصال به PivotTable و توابع SUM اکسل
        const gridDataList = gridQuestions.map(gq => {
          let items = answers[gq.id];
          if (typeof items === 'string' && items.trim().startsWith('[')) {
            try { items = JSON.parse(items); } catch {}
          }
          return Array.isArray(items) ? items : [];
        });

        const maxGridRows = Math.max(...gridDataList.map(list => list.length), 0);

        if (maxGridRows === 0) {
          const emptyGridCols = [];
          gridQuestions.forEach(gq => {
            emptyGridCols.push('""');
            gq.columns.forEach(() => emptyGridCols.push('""'));
          });
          rows.push([...baseCols, ...regularCols, ...emptyGridCols, ...fileCols].join(','));
        } else {
          for (let rIdx = 0; rIdx < maxGridRows; rIdx++) {
            const itemCols = [];
            gridQuestions.forEach((gq, gIdx) => {
              const rowData = gridDataList[gIdx][rIdx];
              if (rowData) {
                itemCols.push(`"${rIdx + 1}"`);
                gq.columns.forEach(col => {
                  itemCols.push(formatCsvCell(resolveFieldForCsv(col, rowData[col.id], rowData, gq.columns)));
                });
              } else {
                itemCols.push('""');
                gq.columns.forEach(() => itemCols.push('""'));
              }
            });
            rows.push([...baseCols, ...regularCols, ...itemCols, ...fileCols].join(','));
          }
        }
      }
    });

    const csvContent = '\uFEFF' + [allHeaders, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Report_${reportData.formTitle}_v${reportData.version}.${reportData.revision}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // شیء فرم فعال برای انتقال به مودال‌ها
  const activeFormObj = useMemo(() => {
    if (!reportData) {
      return accessibleForms.find(f => f.formID === selectedReportFormId) || null;
    }
    return {
      formID: reportData.formId,
      title: reportData.formTitle,
      version: reportData.version,
      revision: reportData.revision,
      schemaJson: reportData.schemaJSON,
      SchemaJSON: reportData.schemaJSON,
      isPublic: reportData.isPublic
    };
  }, [reportData, accessibleForms, selectedReportFormId]);

  const translateWorkflowStatus = (rawStatus) => {
    const s = String(rawStatus || '').trim();
    if (!s) return 'نامشخص';
    const map = {
      Completed: 'تکمیل‌شده',
      Approved: 'تایید شده',
      Rejected: 'رد شده',
      Pending: 'در انتظار تایید',
      Submitted: 'ثبت‌شده',
      InProgress: 'در جریان بررسی',
      Cancelled: 'لغو شده',
      Returned: 'برگشت‌داده‌شده',
      Draft: 'پیش‌نویس'
    };
    if (map[s]) return map[s];
    if (s.startsWith('PendingStep_')) {
      const colonIdx = s.indexOf(':');
      return colonIdx !== -1 ? `در انتظار تایید (${s.slice(colonIdx + 1).trim()})` : 'در انتظار تایید';
    }
    return s;
  };

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 pb-8 sm:pb-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-hidden">
      {/* هدر بخش گزارش‌گیری و نوار ابزار اصلی */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-lg sm:text-xl text-slate-800 dark:text-slate-100">
              مرکز گزارش‌گیری و تحلیل داده‌های فرم‌ها
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              بررسی مستقل پاسخ‌های ثبت‌شده، انتخاب چندصفحه‌ای، طراحی و صدور خروجی PDF (A4/A5) و خروجی اکسل
            </p>
          </div>
        </div>

        {reportData && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* دکمه طراحی قالب چاپ (A4/A5) */}
            <button
              type="button"
              onClick={() => setDesignerOpen(true)}
              disabled={!selectedReportFormId}
              className="inline-flex items-center justify-center gap-1.5 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-4 rounded-xl font-medium transition shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
              title="طراحی و شخصی‌سازی قالب‌های چاپ رسمی، خلاصه مدیریتی و رسید تحویل برای این فرم"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>طراحی قالب چاپ (A4/A5)</span>
            </button>

            {/* دکمه خروجی PDF */}
            <button
              type="button"
              disabled={!hasPrintTemplates || filteredSubmissions.length === 0}
              onClick={() => {
                if (!hasPrintTemplates) return;
                const toExport = selectedSubmissionIds.size > 0
                  ? (reportData?.submissions || []).filter(s => selectedSubmissionIds.has(s.submissionID))
                  : filteredSubmissions;

                if (toExport.length > 50) {
                  toast.warning(`محدودیت خروجی گروهی:\nحداکثر ۵۰ درخواست در هر نوبت قابل صدور PDF همزمان است تا مرورگر دچار افت سرعت نشود.\nدر حال حاضر ${toExport.length} مورد انتخاب شده است. لطفاً فیلتر جستجو را محدودتر کرده یا حداکثر ۵۰ سطر را انتخاب فرمایید.`, 7000);
                  return;
                }

                setTargetPdfSubmissions(toExport);
                setPdfExportModalOpen(true);
              }}
              className={`inline-flex items-center justify-center gap-1.5 h-10 text-xs px-4 rounded-xl font-medium transition shadow-xs shrink-0 whitespace-nowrap ${
                hasPrintTemplates && filteredSubmissions.length > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50'
              }`}
              title={
                !hasPrintTemplates
                  ? (isCurrentReportPublic ? 'برای این فرم نظرسنجی قالب چاپی تعریف نشده است (اختیاری)' : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است')
                  : filteredSubmissions.length === 0
                  ? 'داده‌ای برای خروجی وجود ندارد'
                  : selectedSubmissionIds.size > 0
                  ? `پیش‌نمایش و صدور PDF (${selectedSubmissionIds.size} مورد انتخاب‌شده)`
                  : `پیش‌نمایش و صدور PDF (همه ${filteredSubmissions.length} مورد)`
              }
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>
                خروجی PDF {selectedSubmissionIds.size > 0 ? `(${selectedSubmissionIds.size})` : ''}
              </span>
            </button>

            {/* دکمه خروجی اکسل */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredSubmissions.length === 0}
              className="inline-flex items-center justify-center gap-1.5 h-10 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-4 rounded-xl font-medium transition shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        )}
      </div>

      {/* انتخاب فرم و نگارش */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">۱. انتخاب فرم مورد نظر:</label>
          <select
            value={selectedReportTitle}
            onChange={(e) => {
              const newTitle = e.target.value;
              setSelectedReportTitle(newTitle);
              const vers = accessibleForms.filter(f => f.title === newTitle);
              if (vers.length > 0) {
                setSelectedReportFormId(vers[0].formID);
                fetchReportForFormId(vers[0].formID);
              } else {
                setSelectedReportFormId(null);
                setReportData(null);
              }
            }}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">-- انتخاب فرم --</option>
            {distinctFormTitles.map((t, idx) => {
              const sampleForm = accessibleForms.find(f => f.title === t);
              let isPub = sampleForm?.isPublic;
              try {
                const s = JSON.parse(sampleForm?.schemaJson || '{}');
                if (s.isPublic) isPub = true;
              } catch (err) {}

              return (
                <option key={idx} value={t}>
                  {t} {isPub ? '(عمومی / نظرسنجی)' : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">۲. انتخاب نگارش (Version / Revision):</label>
          <select
            disabled={!selectedReportTitle}
            value={selectedReportFormId || ''}
            onChange={(e) => {
              const id = parseInt(e.target.value, 10);
              setSelectedReportFormId(id);
              fetchReportForFormId(id);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {versionsOfSelectedTitle.map((v) => (
              <option key={v.formID} value={v.formID}>
                نگارش {v.version}.{v.revision} ({v.status === 'Active' ? 'فعال' : 'بایگانی'}) - کد: {v.formID}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* خلاصه آماری */}
      {reportData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="bg-white dark:bg-[#1e2030] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[11px] text-slate-400 font-bold block mb-1">کل پاسخ‌های دریافتی</span>
            <span className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-100">{reportData.submissions?.length || 0}</span>
          </div>
          <div className="bg-white dark:bg-[#1e2030] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block mb-1">تایید نهایی / مختومه</span>
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              {reportData.submissions?.filter(s => s.workflowStatus === 'Approved' || s.workflowStatus === 'Completed').length || 0}
            </span>
          </div>
          <div className="bg-white dark:bg-[#1e2030] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold block mb-1">در جریان بررسی</span>
            <span className="text-2xl font-bold font-mono text-blue-700 dark:text-blue-300">
              {reportData.submissions?.filter(s => s.workflowStatus === 'Submitted' || s.workflowStatus.startsWith('PendingStep')).length || 0}
            </span>
          </div>
          <div className="bg-white dark:bg-[#1e2030] p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-2xs">
            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold block mb-1">رد شده</span>
            <span className="text-2xl font-bold font-mono text-rose-700 dark:text-rose-300">
              {reportData.submissions?.filter(s => s.workflowStatus === 'Rejected').length || 0}
            </span>
          </div>
        </div>
      )}

      {/* نوار جستجو و فیلتر */}
      {reportData && (
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4 pt-2 pb-3 sm:pb-1">
          <div className="relative flex-1 w-full md:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="جستجو در کد رهگیری، کاربر یا متن پاسخ‌ها..."
              value={reportSearchTerm}
              onChange={(e) => {
                setReportSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pr-9 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-start gap-2 w-full md:w-auto pb-2 sm:pb-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">فیلتر وضعیت:</span>
            <select
              value={reportStatusFilter}
              onChange={(e) => {
                setReportStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="flex-1 sm:flex-initial min-h-[38px] text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">همه وضعیت‌ها</option>
              <option value="Completed">تکمیل‌شده</option>
              <option value="Approved">تایید شده</option>
              <option value="Rejected">رد شده</option>
            </select>
          </div>
        </div>
      )}

      {/* نوار اعلان انتخاب‌های چندصفحه‌ای */}
      {selectedSubmissionIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200/90 dark:border-blue-800/60 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 font-bold">
            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{selectedSubmissionIds.size} درخواست از بین تمام صفحات انتخاب شده است.</span>
          </div>
          <div className="flex items-center gap-3">
            {selectedSubmissionIds.size < filteredSubmissions.length && (
              <button
                type="button"
                onClick={() => setSelectedSubmissionIds(new Set(filteredSubmissions.map(s => s.submissionID)))}
                className="text-blue-700 dark:text-blue-300 hover:text-blue-950 dark:hover:text-blue-100 font-semibold underline cursor-pointer"
              >
                انتخاب تمام {filteredSubmissions.length} درخواست
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedSubmissionIds(new Set())}
              className="flex items-center gap-1 bg-white dark:bg-[#252736] hover:bg-blue-100 dark:hover:bg-slate-800 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-slate-700 px-3 py-1 rounded-xl font-bold transition cursor-pointer shadow-2xs"
            >
              <X className="w-3.5 h-3.5" />
              <span>لغو انتخاب‌ها</span>
            </button>
          </div>
        </div>
      )}

      {/* جدول داده‌ها با ستون چک‌باکس و عملیات PDF */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden shadow-2xs min-h-[220px] bg-white dark:bg-[#1e2030] flex flex-col">
        {reportLoading ? (
          <div className="py-24 text-center text-slate-400">در حال دریافت داده‌های گزارش...</div>
        ) : !reportData ? (
          <div className="py-24 text-center text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <span>لطفاً ابتدا یک فرم و نگارش آن را انتخاب کنید.</span>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="py-24 text-center text-slate-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <span>هیچ داده‌ای برای این نگارش یا فیلتر یافت نشد.</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-visible md:overflow-y-auto max-h-none md:max-h-[520px] w-full flex-1">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 select-none sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectPage}
                        className="text-slate-400 hover:text-blue-600 transition cursor-pointer inline-flex items-center justify-center"
                        title={isCurrentPageAllSelected ? 'لغو انتخاب موارد این صفحه' : 'انتخاب همه موارد این صفحه'}
                      >
                        {isCurrentPageAllSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3 w-16 text-center whitespace-nowrap">عملیات</th>
                    <th className="p-3 whitespace-nowrap">کد رهگیری</th>
                    <th className="p-3 whitespace-nowrap">وضعیت</th>
                    <th className="p-3 whitespace-nowrap">ثبت‌کننده</th>
                    <th className="p-3 whitespace-nowrap">تاریخ ثبت</th>
                    <th className="p-3 whitespace-nowrap">ساعت ثبت</th>
                    {reportQuestions.map(q => (
                      <React.Fragment key={q.id}>
                        <th className="p-3 whitespace-nowrap min-w-[140px]">{q.label}</th>
                        {q.unit && <th className="p-3 whitespace-nowrap text-blue-600">واحد [{q.label}]</th>}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {pagedSubmissions.map((sub, pIdx) => {
                    let parsedData = {};
                    try {
                      parsedData = JSON.parse(sub.dataJSON) || {};
                    } catch (e) {}

                    const isRowSelected = selectedSubmissionIds.has(sub.submissionID);
                    const globalIdx = startIndex + pIdx + 1;

                    return (
                      <tr
                        key={sub.submissionID}
                        className={`transition ${isRowSelected ? 'bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-50/70 dark:hover:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                      >
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={() => handleToggleRowSelect(sub.submissionID)}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-3 text-center text-slate-400 font-mono">{globalIdx}</td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!hasPrintTemplates}
                            onClick={() => {
                              if (!hasPrintTemplates) return;
                              setTargetPdfSubmissions([sub]);
                              setPdfExportModalOpen(true);
                            }}
                            className={`p-1.5 rounded-lg transition inline-flex items-center justify-center ${
                              hasPrintTemplates
                                ? 'text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-500/15 cursor-pointer'
                                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-50'
                            }`}
                            title={
                              hasPrintTemplates
                                ? `پیش‌نمایش و صدور PDF برای درخواست ${sub.trackingCode}`
                                : 'ابتدا قالب چاپ (A4/A5) برای این فرم طراحی نشده است'
                            }
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap text-right" dir="ltr">
                          {sub.trackingCode}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            sub.workflowStatus === 'Completed' ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' :
                            sub.workflowStatus === 'Approved' ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30' :
                            sub.workflowStatus === 'Rejected' ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30' :
                            'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                          }`}>
                            {translateWorkflowStatus(sub.workflowStatus)}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-200">
                          {sub.submittedByUserName}
                        </td>
                        <td className="p-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap text-[11px] text-right" dir="ltr">
                          {toPersianDateOnly(sub.submittedAt)}
                        </td>
                        <td className="p-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px] text-right" dir="ltr">
                          {toPersianTimeOnly(sub.submittedAt)}
                        </td>
                        {reportQuestions.map(q => {
                          let val = parsedData[q.id];
                          if (typeof val === 'string' && val.trim().startsWith('[') && ['table', 'repeater_grid', 'repeating_table'].includes(q.type)) {
                            try { val = JSON.parse(val); } catch {}
                          }
                          let displayVal = '—';
                          const isTable = ['table', 'repeater_grid', 'repeating_table'].includes(q.type) || (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object');

                          const isFile = ['file', 'upload', 'attachment'].includes(q.type);
                          if (val !== undefined && val !== null && val !== '') {
                            if (isTable) {
                              const rowCount = Array.isArray(val) ? val.length : 0;
                              displayVal = rowCount > 0 ? `${rowCount} قلم ثبت‌شده` : 'موردی ثبت نشده';
                            } else if (isFile) {
                              displayVal = 'دارای فایل پیوست';
                            } else if (q.type === 'master_lookup') {
                              displayVal = resolveMasterValue(q, val) || '—';
                            } else if (Array.isArray(val)) {
                              displayVal = val.map(it => (it && typeof it === 'object' ? (it.originalName || it.originalFileName || it.name || it.fileName || String(it)) : String(it))).join('، ');
                            } else if (val && typeof val === 'object') {
                              displayVal = val.originalName || val.originalFileName || val.name || val.fileName || '—';
                            } else {
                              displayVal = String(val);
                            }
                          }

                          return (
                            <React.Fragment key={q.id}>
                              <td className="p-3 text-slate-700 dark:text-slate-200 max-w-xs truncate" title={String(displayVal)}>
                                {isTable && Array.isArray(val) && val.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded text-[11px] font-bold">
                                    <Layers className="w-3 h-3" />
                                    <span>{displayVal}</span>
                                  </span>
                                ) : isFile && val ? (
                                  <a
                                    href={`/attachments/${encodeURIComponent(sub.trackingCode || '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-500/15 hover:bg-purple-100 dark:hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 px-2 py-0.5 rounded text-[11px] font-bold transition"
                                    title="مشاهده و دانلود پیوست‌های پرونده"
                                  >
                                    <Folder className="w-3 h-3" />
                                    <span>پوشه پیوست‌ها</span>
                                  </a>
                                ) : (
                                  String(displayVal)
                                )}
                              </td>
                              {q.unit && (
                                <td className="p-3 font-mono text-xs text-slate-500 dark:text-slate-400">{q.unit}</td>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* فوتر صفحه‌بندی جدول */}
            <div className="bg-slate-50 dark:bg-[#181926] border-t border-slate-200 dark:border-slate-700/80 px-3 sm:px-4 py-3 pb-4 sm:pb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <span>تعداد در صفحه:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
                <span className="font-mono pr-2">
                  نمایش {totalFiltered > 0 ? startIndex + 1 : 0} تا {endIndex} از {totalFiltered} پاسخ
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-mono">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="صفحه قبل"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="px-2 text-slate-700 dark:text-slate-200 font-bold">
                  صفحه {currentPage} از {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="صفحه بعد"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* مودال طراح قالب چاپ */}
      {designerOpen && activeFormObj && (
        <ErrorBoundary
          title="طراح قالب‌های چاپ حرفه‌ای (A4 / A5)"
          onClose={() => setDesignerOpen(false)}
        >
          <PrintTemplateDesignerModal
            isOpen={designerOpen}
            onClose={() => setDesignerOpen(false)}
            form={activeFormObj}
            branding={branding}
            onSave={handleSaveDesignerTemplates}
          />
        </ErrorBoundary>
      )}

      {/* مودال پیش‌نمایش و صدور PDF */}
      {pdfExportModalOpen && activeFormObj && (
        <PdfExportPreviewModal
          isOpen={pdfExportModalOpen}
          onClose={() => setPdfExportModalOpen(false)}
          form={activeFormObj}
          submissions={targetPdfSubmissions}
          branding={branding}
          onOpenDesigner={() => setDesignerOpen(true)}
        />
      )}
    </div>
  );
}
