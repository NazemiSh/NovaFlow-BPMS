import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../api';
import {
  X, Printer, Download, Eye, ZoomIn, ZoomOut, FileText,
  Building2, QrCode, FileSignature, CheckCircle2, ChevronRight, ChevronLeft,
  Settings, Layers, RefreshCw, Scissors, Bookmark,
  FolderArchive, FileSpreadsheet, Image as ImageIcon, ExternalLink, File, Calculator
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toPersianDateOnly, toPersianTimeOnly } from './PersianDatePicker';
import { BG_COLOR_OPTIONS, isDarkColor, getFontSizePx, normalizeTextAlign } from './PrintTemplateDesignerModal';
import AuthImage from './AuthImage';
import { evaluateFormula, evaluateRowFormula } from '../utils/formulaEvaluator';
import { useMasterDataResolver } from '../utils/masterDataResolver';
import { useDialog } from './GlobalDialogProvider';
import { useResponsiveSheetScale } from '../utils/useResponsiveSheetScale';

const PAPER_DIMENSIONS = {
  A4: { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } },
  A5: { portrait: { width: 148, height: 210 }, landscape: { width: 210, height: 148 } }
};

// پارس یکنواخت و ایمن پاسخ‌های ثبت‌شده پرونده بدون وابستگی به نام‌گذاری فیلد
const parseSubmissionAnswers = (sub) => {
  if (!sub) return {};
  const raw = sub.dataJSON ?? sub.DataJSON ?? sub.formDataJson ?? sub.dataJson ?? sub.answers;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
};

const formatWorkflowStatus = (status) => {
  if (!status) return 'تایید شده';
  if (typeof status === 'string' && status.startsWith('PendingStep_')) {
    const stepName = status.includes(':') ? status.substring(status.indexOf(':') + 1).trim() : '';
    return stepName ? `در انتظار تایید (${stepName})` : 'در انتظار تایید';
  }
  if (status === 'Approved' || status === 'Completed') return 'تایید شده';
  if (status === 'Rejected') return 'رد شده';
  return status;
};

function CalculatedBoxesGrid({ boxes = [], answers = {}, formQuestions = null }) {
  if (!boxes || boxes.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-slate-300 w-full !text-slate-900" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div className="flex items-center gap-1.5 mb-2.5 !text-slate-900 font-bold text-[11px]">
        <Calculator className="w-3.5 h-3.5 text-blue-600" />
        <span className="!text-slate-900">باکس‌های خلاصه و محاسبات فرمولی</span>
      </div>
      <div className="grid grid-cols-12 gap-2.5">
        {boxes.map((box, bIdx) => {
          const colSpan = box.width === '1/1'
            ? 'col-span-12'
            : box.width === '1/2'
            ? 'col-span-12 sm:col-span-6'
            : 'col-span-12 sm:col-span-4';

          const { formatted, error } = evaluateFormula(box.formula, answers, box, formQuestions);
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
              className={`${colSpan} rounded-xl p-3 shadow-2xs !text-slate-900`}
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

export default function PdfExportPreviewModal({
  isOpen,
  onClose,
  form,
  submissions = [],
  branding,
  onOpenDesigner
}) {
  const { toast } = useDialog();
  // استخراج لیست کامل فیلدهای فرم
  const formQuestionsList = useMemo(() => {
    if (!form) return [];
    try {
      const rawSchema = form.schemaJson || form.SchemaJSON;
      const s = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : (rawSchema || form.parsedSchema || {});
      const list = [];
      (s.sections || []).forEach((sec) => {
        (sec.questions || []).forEach((q) => {
          if (q) list.push(q);
        });
      });
      if (list.length === 0 && Array.isArray(form.questions)) {
        return form.questions;
      }
      return list;
    } catch (e) {
      console.error('Error parsing form questions in PdfExportPreviewModal:', e);
      return Array.isArray(form.questions) ? form.questions : [];
    }
  }, [form]);

  // تعریف متغیر جهت سازگاری و جلوگیری از خطای ReferenceError
  const formQuestions = formQuestionsList;
  const { resolveMasterValue } = useMasterDataResolver(formQuestionsList);

  // نگاشت فیلدهای فرم جهت دسترسی سریع بر پایه شناسه فیلد
  const formQuestionsMap = useMemo(() => {
    const map = new Map();
    formQuestionsList.forEach((q) => {
      if (q && q.id) {
        map.set(q.id, q);
      }
    });
    return map;
  }, [formQuestionsList]);

  // دریافت قالب‌های چاپ فرم
  const templates = useMemo(() => {
    if (!form) return [];
    try {
      const rawSchema = form.schemaJson || form.SchemaJSON;
      const s = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : (rawSchema || {});
      if (Array.isArray(s.printTemplates) && s.printTemplates.length > 0) {
        return s.printTemplates;
      }
    } catch (e) {}
    return [];
  }, [form]);

  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || null);
  const [zoomScale, setZoomScale] = useState(0.85);
  const [submissionHistories, setSubmissionHistories] = useState({});
  const [loadingHistories, setLoadingHistories] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [viewMode, setViewMode] = useState('all'); // 'all' (پشت‌سرهم) | 'single' (برگه‌به‌برگه)

  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [templates, selectedTemplateId]);

  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId) || templates[0] || null;
  }, [templates, selectedTemplateId]);

  const extractAttachmentsFromSubmission = useCallback((sub, answers = null) => {
    const list = [];
    const seen = new Set();
    const trackingCode = sub?.trackingCode || '';
    const safeAnswers = (answers && Object.keys(answers).length > 0)
      ? answers
      : parseSubmissionAnswers(sub);

    const cleanFileNameAndExtension = (rawName, fallbackExt = '') => {
      let strName = String(rawName || '').trim();
      if (!strName) return null;
      strName = strName.split('?')[0];
      const parts = strName.split(/[\/\\]/);
      const fileNameOnly = parts[parts.length - 1]?.trim();
      if (!fileNameOnly) return null;

      let stored = fileNameOnly;
      let display = fileNameOnly;

      // حذف پیشوند GUID یا ۸ کاراکتر هگز در صورت وجود (مثلاً a1b2c3d4_نام‌فایل.pdf)
      const underscoreIdx = fileNameOnly.indexOf('_');
      if (underscoreIdx > 0 && underscoreIdx < fileNameOnly.length - 1) {
        const prefix = fileNameOnly.substring(0, underscoreIdx);
        if (/^[a-f0-9]{8}$/i.test(prefix) || /^[a-f0-9-]{32,36}$/i.test(prefix)) {
          display = fileNameOnly.substring(underscoreIdx + 1);
        }
      }

      let ext = (fallbackExt || '').trim().replace(/^\./, '');
      if (!ext && display.includes('.')) {
        ext = display.split('.').pop();
      }
      if (!ext && stored.includes('.')) {
        ext = stored.split('.').pop();
      }
      ext = (ext || '').toUpperCase().replace(/^\./, '');
      if (!ext || ext === 'FILE') {
        const dotMatch = (display || stored).match(/\.([a-zA-Z0-9]{2,5})$/);
        ext = dotMatch ? dotMatch[1].toUpperCase() : 'FILE';
      }

      return {
        displayName: display || stored,
        storedFileName: stored || display,
        ext: ext || 'FILE'
      };
    };

    const processAttachment = (val, fieldLabel) => {
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(item => processAttachment(item, fieldLabel));
        return;
      }
      if (typeof val === 'object') {
        const rawName = val.originalFileName || val.originalName || val.fileName || val.storedFileName;
        const fileUrl = val.downloadUrl || val.url || '';
        // فقط فایل‌های واقعی آپلود شده پذیرفته می‌شوند
        if (!rawName && !fileUrl) return;

        const candidateName = rawName || (fileUrl ? fileUrl.split('/').pop() : '');
        const cleaned = cleanFileNameAndExtension(candidateName, val.extension);
        if (!cleaned) return;

        const { displayName, storedFileName, ext } = cleaned;
        const safeKey = `${trackingCode}_${storedFileName}_${displayName}`;
        if (!seen.has(safeKey)) {
          seen.add(safeKey);
          const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG'].includes(ext);
          const downloadUrl = val.downloadUrl || val.url || `/api/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments/download?fileName=${encodeURIComponent(storedFileName)}`;
          list.push({
            name: displayName,
            storedFileName: storedFileName || displayName,
            fieldLabel: fieldLabel || 'پیوست',
            extension: ext,
            downloadUrl,
            isImage,
            trackingCode
          });
        }
        return;
      }
      if (typeof val === 'string') {
        const str = val.trim();
        if (!str) return;
        if (str.startsWith('[') || str.startsWith('{')) {
          try {
            const parsed = JSON.parse(str);
            processAttachment(parsed, fieldLabel);
            return;
          } catch {}
        }
        // اگر رشته متنی یک مسیر فایل یا نام فایل با پسوند معتبر باشد
        const isFileLike = str.includes('/uploads/') || /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|webp|gif|bmp|svg|zip|rar|7z|txt|csv)$/i.test(str);
        if (isFileLike) {
          const cleaned = cleanFileNameAndExtension(str);
          if (!cleaned) return;
          const { displayName, storedFileName, ext } = cleaned;
          const safeKey = `${trackingCode}_${storedFileName}_${displayName}`;
          if (!seen.has(safeKey)) {
            seen.add(safeKey);
            const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG'].includes(ext);
            const downloadUrl = str.startsWith('http') || str.startsWith('/')
              ? str
              : `/api/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments/download?fileName=${encodeURIComponent(storedFileName)}`;
            list.push({
              name: displayName,
              storedFileName,
              fieldLabel: fieldLabel || 'پیوست',
              extension: ext,
              downloadUrl,
              isImage,
              trackingCode
            });
          }
        }
      }
    };

    // استخراج منحصراً از سوالات فیلد نوع فایل (file, upload, attachment)
    formQuestions.forEach(q => {
      if (['file', 'upload', 'attachment'].includes(q.type)) {
        const val = safeAnswers[q.id];
        if (val) {
          processAttachment(val, q.label || 'فایل ضمیمه');
        }
      }
    });

    return list;
  }, [formQuestions]);

  // بررسی وجود هرگونه فایل پیوست واقعی در درخواست‌ها جهت نمایش یا عدم نمایش دکمه در نوار ابزار
  const hasAnyAttachments = useMemo(() => {
    if (!submissions || submissions.length === 0) return false;
    return submissions.some(sub => {
      const answers = parseSubmissionAnswers(sub);
      return extractAttachmentsFromSubmission(sub, answers).length > 0;
    });
  }, [submissions, extractAttachmentsFromSubmission]);

  // وضعیت نمایش تصاویر پیوست در انتهای برگه چاپ (پیش‌فرض غیرفعال)
  const [showImageAttachments, setShowImageAttachments] = useState(false);

  useEffect(() => {
    if (activeTemplate) {
      setShowImageAttachments(Boolean(activeTemplate.showImageAttachments));
    }
  }, [activeTemplate]);

  const getFileIcon = (ext = '', isImage = false) => {
    const e = ext.toUpperCase().replace('.', '');
    if (isImage || ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'SVG'].includes(e)) {
      return <ImageIcon className="w-3.5 h-3.5 text-purple-600 shrink-0" />;
    }
    if (['PDF'].includes(e)) {
      return <FileText className="w-3.5 h-3.5 text-rose-600 shrink-0" />;
    }
    if (['XLS', 'XLSX', 'CSV'].includes(e)) {
      return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    }
    if (['DOC', 'DOCX'].includes(e)) {
      return <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />;
    }
    if (['ZIP', 'RAR', '7Z'].includes(e)) {
      return <FolderArchive className="w-3.5 h-3.5 text-amber-600 shrink-0" />;
    }
    return <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  const getBadgeClass = (ext = '') => {
    // استایل روشن و رسمی چاپی متناسب با کاغذ سفید بدون کادر سیاه
    return 'bg-slate-100 text-slate-800 border-slate-300 font-mono';
  };

  const handleDownloadAttachment = async (att) => {
    try {
      const token = localStorage.getItem('bpms_token');
      const trackingCode = att.trackingCode || '';
      const fileToDownload = att.storedFileName || att.name;
      const downloadEndpoint = `/api/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments/download?fileName=${encodeURIComponent(fileToDownload)}`;

      const resp = await fetch(downloadEndpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!resp.ok) throw new Error('Download request failed with status ' + resp.status);
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.setAttribute('download', att.name || fileToDownload);
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('Error downloading attachment:', err);
      toast.error('خطا در دریافت فایل پیوست.');
    }
  };

  const curPaperSize = activeTemplate?.paperSize || 'A4';
  const curOrientation = activeTemplate?.orientation || 'portrait';
  const sheetMm = PAPER_DIMENSIONS[curPaperSize]?.[curOrientation] || PAPER_DIMENSIONS.A4.portrait;
  const basePxWidth = sheetMm.width * 3.78;
  const basePxHeight = sheetMm.height * 3.78;

  const rawMargins = activeTemplate?.margins || {};
  const marginTop = Math.max(10, Number(rawMargins.top) || 15);
  const marginBottom = Math.max(10, Number(rawMargins.bottom) || 15);
  const marginLeft = Math.max(10, Number(rawMargins.left) || 12);
  const marginRight = Math.max(10, Number(rawMargins.right) || 12);

  const totalPages = Math.max(1, activeTemplate?.pageCount || 1, ...((activeTemplate?.blocks || []).map(b => b.page || 1)));
  const visibleSheetsCount = totalPages * (viewMode === 'all' ? Math.max(1, submissions.length) : 1);
  const {
    wrapperRef: previewWrapperRef,
    contentRef: printableAreaRef,
    isMobile: isMobileViewport,
    effectiveScale,
    scaledWidth,
    scaledHeight
  } = useResponsiveSheetScale(
    basePxWidth,
    basePxHeight,
    zoomScale,
    visibleSheetsCount,
    Boolean(isOpen),
    `${selectedTemplateId}_${viewMode}_${currentPreviewIndex}_${submissions.length}`
  );

  // دریافت تاریخچه گردش‌کار (امضاها) برای درخواست‌های در حال نمایش
  useEffect(() => {
    if (!isOpen || !submissions || submissions.length === 0) return;
    const hasSignatureBlock = activeTemplate?.blocks?.some(b => b.type === 'signatures');
    if (!hasSignatureBlock) return;

    let isMounted = true;
    const fetchHistories = async () => {
      setLoadingHistories(true);
      const newHistories = { ...submissionHistories };
      const toFetch = submissions.filter(s => {
        const sId = s.submissionID ?? s.submissionId;
        return sId && !newHistories[sId];
      });

      for (const sub of toFetch.slice(0, 20)) {
        const sId = sub.submissionID ?? sub.submissionId;
        try {
          const res = await api.get(`/workflow/submissions/${sId}/history`);
          newHistories[sId] = res.data || [];
          if ((!sub.stepsProgress || sub.stepsProgress.length === 0) && (!sub.StepsProgress || sub.StepsProgress.length === 0)) {
            try {
              const resSub = await api.get(`/workflow/submissions/${sId}`);
              if (resSub.data?.stepsProgress) {
                sub.stepsProgress = resSub.data.stepsProgress;
              }
            } catch {}
          }
        } catch (e) {
          newHistories[sId] = [];
        }
      }
      if (isMounted) {
        setSubmissionHistories(newHistories);
        setLoadingHistories(false);
      }
    };

    fetchHistories();
    return () => { isMounted = false; };
  }, [isOpen, submissions, activeTemplate]);

  // اجرای فرآیند چاپ با فونت اجباری IRANSans و کلاس شکست صفحه
  const handlePrint = () => {
    if (!activeTemplate) return;

    const styleId = 'bpms-dynamic-print-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    styleEl.innerHTML = `
      @page {
        size: ${curPaperSize} ${curOrientation};
        margin: 10mm !important;
      }
      @media print {
        * {
          font-family: 'IRANSansX', 'IRANSans', 'Vazirmatn', sans-serif !important;
          box-sizing: border-box !important;
          color-scheme: light !important;
        }
        html, body {
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #0f172a !important;
          margin: 0 !important;
          padding: 0 !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          position: static !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body > *:not(#bpms-print-portal) {
          display: none !important;
        }
        body > #bpms-print-portal {
          display: block !important;
          position: static !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .bpms-submission-group {
          display: block !important;
        }
        .bpms-print-sheet {
          box-sizing: border-box !important;
          background-color: #ffffff !important;
          background: #ffffff !important;
          color: #0f172a !important;
          box-shadow: none !important;
          border: none !important;
          margin: 0 !important;
          padding-top: ${marginTop}mm !important;
          padding-bottom: ${marginBottom}mm !important;
          padding-left: ${marginLeft}mm !important;
          padding-right: ${marginRight}mm !important;
          width: 100% !important;
          min-height: 100vh !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .print-break-after {
          page-break-after: always !important;
          break-after: page !important;
        }
      }
    `;

    const originalTitle = document.title;
    const rawPlatform = branding?.systemTitle || branding?.companyName || 'BPMS';
    const safePlatform = rawPlatform.replace(/[\/\\:*?"<>|]/g, '').trim().replace(/\s+/g, '_') || 'BPMS';
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    
    let uniqueFileName = `${safePlatform}_${timestamp}`;
    if (submissions && submissions.length === 1 && submissions[0]?.trackingCode) {
      uniqueFileName = String(submissions[0].trackingCode).replace(/[\/\\:*?"<>|]/g, '').trim();
    } else if (submissions && submissions.length > 1) {
      const firstTrk = submissions[0]?.trackingCode ? `_${submissions[0].trackingCode}` : '';
      uniqueFileName = `${safePlatform}_Batch_${submissions.length}${firstTrk}`;
    }

    document.title = uniqueFileName;

    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);

    setTimeout(() => {
      window.print();
      setTimeout(restoreTitle, 4000);
    }, 150);
  };

  // فرمت مقادیر فیلدها جهت نمایش در پیش‌نمایش چاپ
  const formatFieldValue = (question, rawVal) => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return '—';
    if (question?.type === 'master_lookup') {
      const resolved = resolveMasterValue(question, rawVal);
      return resolved || '—';
    }
    if (Array.isArray(rawVal)) {
      return rawVal.map(item => {
        if (item && typeof item === 'object') {
          return item.originalName || item.originalFileName || item.name || item.fileName || String(item);
        }
        return String(item);
      }).join('، ');
    }
    if (typeof rawVal === 'object') {
      return rawVal.originalName || rawVal.originalFileName || rawVal.name || rawVal.fileName || '—';
    }
    if (typeof rawVal === 'boolean') {
      return rawVal ? 'بله' : 'خیر';
    }
    if (question?.type === 'checkbox') {
      return rawVal === true || rawVal === 'true' || rawVal === 'on' ? 'بله' : 'خیر';
    }
    if (question?.type === 'number' || question?.type === 'currency' || question?.type === 'price') {
      const num = Number(rawVal);
      if (!isNaN(num)) {
        return question?.unit ? `${num.toLocaleString('fa-IR')} ${question.unit}` : num.toLocaleString('fa-IR');
      }
    }
    return String(rawVal);
  };

  if (!isOpen || !form) return null;

  if (templates.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl animate-in zoom-in-95">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 mb-1">
            قالب چاپی یافت نشد!
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
            قالب چاپ (A4/A5) برای این فرم تعریف نشده است. برای صدور PDF، لازم است حداقل یک قالب اختصاصی طراحی کنید.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              انصراف
            </button>
            {onOpenDesigner && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenDesigner();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
              >
                طراحی قالب جدید
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displaySubmissions = viewMode === 'single'
    ? [submissions[currentPreviewIndex]].filter(Boolean)
    : submissions;

  const getPaddingClass = (p) => {
    if (p === 'lg') return 'p-4';
    if (p === 'md') return 'p-3';
    return 'p-1.5';
  };

  // رندر یکپارچه جداول اقلام چندسطری با رزولوشن فیلدهای مرجع و اجبار متن تیره خوانا در تم تاریک
  const renderRepeaterTableBlock = (question, rawVal, compact = false) => {
    let tableRows = [];
    if (Array.isArray(rawVal)) {
      tableRows = rawVal;
    } else if (typeof rawVal === 'string' && rawVal.trim().startsWith('[')) {
      try { tableRows = JSON.parse(rawVal); } catch (e) {}
    }

    const cols = (question?.columns && question.columns.length > 0)
      ? question.columns
      : [{ id: 'col1', title: 'عنوان ستون' }];

    const cellPad = compact ? 'p-1' : 'p-1.5';
    const getResolvedCell = (row, col) => {
      let val = row?.[col.id];
      if ((val === undefined || val === null || val === '') && col.type === 'calculated' && col.formula) {
        const calcRes = evaluateRowFormula(col.formula, row, cols);
        if (calcRes !== '' && calcRes !== null && calcRes !== undefined) {
          val = calcRes;
        }
      }
      if (val === undefined || val === null || val === '') return '—';
      if (col.type === 'master_lookup') {
        const resolved = resolveMasterValue(col, val);
        return resolved || '—';
      }
      if (typeof val === 'object') return formatFieldValue(col, val);
      return String(val);
    };

    const getNumericCellValue = (row, col) => {
      let raw = row?.[col.id];
      if ((raw === undefined || raw === null || raw === '') && col.type === 'calculated' && col.formula) {
        raw = evaluateRowFormula(col.formula, row, cols);
      }
      return parseFloat(raw) || 0;
    };

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-slate-300 text-right text-[10px] bg-white !text-slate-900">
          <thead>
            <tr className="bg-slate-100 !text-slate-900 font-bold border-b border-slate-300">
              <th className={`${cellPad} border border-slate-300 w-8 text-center !text-slate-900`}>#</th>
              {cols.map((c, cIdx) => (
                <th key={c.id || cIdx} className={`${cellPad} border border-slate-300 !text-slate-900`}>
                  {c.title || c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 1} className="p-2.5 text-center !text-slate-700 italic bg-white">
                  {compact ? 'ردیفی ثبت نشده است' : 'سطری در این جدول ثبت نشده است.'}
                </td>
              </tr>
            ) : (
              tableRows.map((row, rIdx) => (
                <tr key={rIdx} className={`${rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-200`}>
                  <td className={`${cellPad} border border-slate-300 text-center !text-slate-700 font-mono`}>
                    {rIdx + 1}
                  </td>
                  {cols.map((c, cIdx) => (
                    <td key={c.id || cIdx} className={`${cellPad} border border-slate-300 !text-slate-900 font-medium`}>
                      {getResolvedCell(row, c)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {Boolean(question?.showSummaryRow) && tableRows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 !text-slate-900">
                <td className={`${cellPad} border border-slate-300 text-center font-mono !text-slate-900`}>جمع</td>
                {cols.map((c, cIdx) => {
                  if (c.includeInTotal || c.type === 'calculated') {
                    const sum = tableRows.reduce((acc, r) => acc + getNumericCellValue(r, c), 0);
                    return (
                      <td key={c.id || cIdx} className={`${cellPad} border border-slate-300 font-mono !text-slate-900 text-left`}>
                        {sum.toLocaleString('fa-IR')}
                      </td>
                    );
                  }
                  return <td key={c.id || cIdx} className={`${cellPad} border border-slate-300 text-center !text-slate-600`}>—</td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  // رندر جامع محتوای هر نوع بلوک جهت چاپ در تمام نواحی سند (بدنه و پاورقی)
  const renderPdfBlockContent = (block, answers, sub, history = []) => {
    // برگه چاپ همواره دارای پس‌زمینه سفید خالص است و رنگ متون تیره استاندارد اداری می‌باشد
    const titleColor = '!text-slate-900';
    const labelColor = '!text-slate-700';
    const valColor = '!text-slate-900';
    const descColor = '!text-slate-600';

    // ۱. سربرگ رسمی (Header)
    if (block.type === 'header') {
      return (
        <div className="pb-3 border-b-2 border-slate-800 w-full !text-slate-900">
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
                <span className="text-xs !text-slate-600">سامانه الکترونیک فرم‌ها و فرآیندها</span>
              </div>
            </div>

            <div className="text-center px-4">
              <h2 className={`text-base font-extrabold ${titleColor}`}>
                {form.title}
              </h2>
              <span className={`text-[10px] ${labelColor} font-medium`}>
                {activeTemplate?.name || 'قالب چاپ'}
              </span>
            </div>

            <div className={`text-left text-[10px] ${labelColor} font-mono space-y-0.5`}>
              {block.showTrackingCode !== false && (
                <div>
                  <span>کد رهگیری: </span>
                  <b className={`font-bold ${titleColor}`}>{sub.trackingCode}</b>
                </div>
              )}
              {block.showDate !== false && (
                <div>
                  <span>تاریخ ثبت: </span>
                  <span className={titleColor}>{toPersianDateOnly(sub.submittedAt)}</span>
                </div>
              )}
              <div>
                <span>وضعیت: </span>
                <span className={`font-bold ${titleColor}`}>{formatWorkflowStatus(sub.workflowStatus)}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const bFontSizePx = getFontSizePx(block.fontSize);
    const bTextAlign = normalizeTextAlign(block.textAlign);

    // ۲. کادر سکشن واقعی (Section Container) با شبکه ۱۲ ستونه
    if (block.type === 'sectionContainer' || block.type === 'sectionTitle') {
      return (
        <div className="space-y-2.5 p-1 w-full !text-slate-900">
          {/* هدر کادر سکشن */}
          <div className="flex items-center gap-2 pb-1.5 border-b border-dashed border-slate-300">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full shrink-0" />
            <div className="flex-1 min-w-0" style={{ textAlign: bTextAlign }}>
              <h4
                className={`font-bold ${titleColor} block w-full`}
                style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
              >
                {block.title || 'عنوان بخش'}
              </h4>
              {block.description && (
                <p
                  className={`${descColor} mt-0.5 leading-relaxed block w-full`}
                  style={{ fontSize: `${Math.max(10, bFontSizePx - 2)}px`, textAlign: bTextAlign }}
                >
                  {block.description}
                </p>
              )}
            </div>
          </div>

          {/* رندر فیلدهای متعلق به این کادر سکشن در شبکه ۱۲ ستونه */}
          {Array.isArray(block.fieldIds) && block.fieldIds.length > 0 && (
            <div className="grid grid-cols-12 gap-2.5 pt-1">
              {block.fieldIds.map((fId) => {
                const question = formQuestionsMap.get(fId);
                if (!question || question.type === 'section' || question.type === 'sectionContainer') return null;
                const rawVal = answers[fId];
                const fConfig = (block.fieldSettings && block.fieldSettings[fId]) || {};
                const curColSpan = fConfig.colSpan || (['table', 'repeater_grid'].includes(question.type) ? 12 : 6);
                const colSpanClass = curColSpan === 12
                  ? 'col-span-12'
                  : curColSpan === 4
                  ? 'col-span-4'
                  : 'col-span-6';

                const fPadding = getPaddingClass(fConfig.padding || 'sm');
                const fShowBorder = fConfig.showBorder !== false && fConfig.hasBorder !== false;
                const fLabelColor = '!text-slate-700';
                const fValColor = '!text-slate-900';
                const fBgStyle = (fConfig.bgColor && fConfig.bgColor !== 'transparent' && fConfig.bgColor !== 'default' && fConfig.bgColor !== '#1e293b' && fConfig.bgColor !== '#172554' && fConfig.bgColor !== '#27272a' && fConfig.bgColor !== '#064e3b' && fConfig.bgColor !== '#451a03')
                  ? fConfig.bgColor
                  : '#ffffff';

                const isTable = question.type === 'table' || question.type === 'repeater_grid';
                const currentLabel = fConfig.customLabel || question.label || 'فیلد';
                const showLabel = fConfig.showLabel !== false;
                const fFontSizePx = getFontSizePx(fConfig.fontSize || block.fontSize);
                const fTextAlign = normalizeTextAlign(fConfig.textAlign || block.textAlign);

                if (isTable) {
                  return (
                    <div
                      key={fId}
                      className={`${colSpanClass} space-y-1.5 rounded-lg ${fPadding} ${
                        fShowBorder ? 'border border-slate-300' : 'border-0 border-transparent'
                      } bg-white !text-slate-900`}
                      style={{ backgroundColor: fBgStyle }}
                    >
                      {showLabel && (
                        <span
                          className={`font-bold ${fValColor} block w-full`}
                          style={{ fontSize: `${fFontSizePx}px`, textAlign: fTextAlign }}
                        >
                          {currentLabel}:
                        </span>
                      )}
                      {renderRepeaterTableBlock(question, rawVal, true)}
                    </div>
                  );
                }

                return (
                  <div
                    key={fId}
                    className={`${colSpanClass} rounded-lg ${fPadding} ${
                      fShowBorder ? 'border border-slate-300' : 'border-0 border-transparent'
                    } space-y-1 bg-white !text-slate-900`}
                    style={{ backgroundColor: fBgStyle }}
                  >
                    {showLabel && (
                      <span
                        className={`font-bold ${fLabelColor} block truncate w-full`}
                        style={{ fontSize: `${fFontSizePx}px`, textAlign: fTextAlign }}
                      >
                        {currentLabel}:
                      </span>
                    )}
                    <span
                      className={`font-semibold ${fValColor} block min-h-[1.25rem] w-full`}
                      style={{ fontSize: `${fFontSizePx}px`, textAlign: fTextAlign }}
                    >
                      {formatFieldValue(question, rawVal)}
                    </span>
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
      const question = formQuestionsMap.get(block.fieldId);
      if (!question || question.type === 'section' || question.type === 'sectionContainer') return null;
      const rawVal = answers[block.fieldId];
      const currentLabel = block.customLabel || question?.label || block.label || 'فیلد';
      const showLabel = block.showLabel !== false;
      const isTable = question?.type === 'table' || question?.type === 'repeater_grid';

      if (isTable) {
        return (
          <div className="space-y-1.5 w-full bg-white !text-slate-900 rounded p-1">
            {showLabel && (
              <span
                className={`font-bold ${titleColor} block w-full`}
                style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
              >
                {currentLabel}:
              </span>
            )}
            {renderRepeaterTableBlock(question, rawVal, false)}
          </div>
        );
      }

      const formattedVal = formatFieldValue(question, rawVal);
      const hasEmbeddedUnit =
        question?.unit &&
        (question?.type === 'number' || question?.type === 'currency' || question?.type === 'price') &&
        formattedVal !== '—';

      return (
        <div className="w-full bg-white !text-slate-900 rounded p-1">
          {showLabel && (
            <span
              className={`font-bold ${labelColor} block mb-0.5 w-full`}
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
            >
              {currentLabel}:
            </span>
          )}
          <div
            className={`font-semibold ${valColor} w-full block`}
            style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
          >
            {formattedVal}
            {!hasEmbeddedUnit && question?.unit && formattedVal !== '—' && (
              <span className="!text-slate-700 mr-1 text-[10px]">({question.unit})</span>
            )}
          </div>
        </div>
      );
    }

    // ۴. متن ثابت (Static Text)
    if (block.type === 'staticText') {
      return (
        <div className="w-full bg-white !text-slate-900 rounded p-1">
          <p
            className={`${valColor} leading-relaxed w-full block`}
            style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
          >
            {block.content}
          </p>
        </div>
      );
    }

    // ۵. جدول تاییدات و گردش‌کار (Signatures)
    if (block.type === 'signatures') {
      return (
        <div className="space-y-1.5 pt-1 w-full bg-white !text-slate-900 rounded p-1">
          <span
            className={`font-bold ${titleColor} block w-full`}
            style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
          >
            {block.title || 'جدول تاییدات و گردش‌کار'}
          </span>
          <table className="w-full border-collapse border border-slate-300 text-right text-[10px] bg-white !text-slate-900">
            <thead>
              <tr className="bg-slate-100 !text-slate-900 font-bold border-b border-slate-300">
                <th className="border border-slate-300 p-1.5 w-8 text-center !text-slate-900">#</th>
                <th className="border border-slate-300 p-1.5 !text-slate-900">مرحله / اقدام</th>
                <th className="border border-slate-300 p-1.5 !text-slate-900">نام و سمت اقدام‌کننده</th>
                <th className="border border-slate-300 p-1.5 !text-slate-900">تاریخ و ساعت</th>
                {block.showComments !== false && (
                  <th className="border border-slate-300 p-1.5 !text-slate-900">توضیحات و هامش</th>
                )}
                <th className="border border-slate-300 p-1.5 w-24 text-center !text-slate-900">وضعیت اقدام</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const subId = sub.submissionID ?? sub.submissionId;
                const isCompleted = sub.workflowStatus === 'Completed' || sub.workflowStatus === 'Approved';
                const isRejected = sub.workflowStatus === 'Rejected';
                const isCompletedOrRejected = isCompleted || isRejected;

                const hasDirectSubmit = history.some(h =>
                  h.actionTaken === 'SubmitDirect' ||
                  h.actionTaken === 'DirectComplete' ||
                  (h.comments && h.comments.includes('بدون نیاز به تایید'))
                );

                // فیلتر کردن ردیف‌های تاریخچه:
                // ۱. حذف Submit و SubmitDirect (چون ردیف اول جدول به صورت ثابت ثبت اولیه درخواست است)
                // ۲. حذف رکوردهای تکراری تایید مرحله‌ای (StepApproved_Single) توسط همان کاربر اگر رکورد بعدی دارد
                const workflowActions = history.filter(h => {
                  if (h.actionTaken === 'Submit' || h.actionTaken === 'SubmitDirect' || h.actionTaken === 'DirectComplete') {
                    return false;
                  }
                  return true;
                }).filter((h, idx, arr) => {
                  if (h.actionTaken === 'StepApproved_Single') {
                    const hasSubsequentActionBySameUser = arr.some((other, oIdx) =>
                      oIdx > idx &&
                      other.actionByUserId === h.actionByUserId &&
                      (other.actionTaken === 'StepApprove' || other.actionTaken === 'FinalApprove' || other.actionTaken === 'Approve') &&
                      (other.previousStatus === h.previousStatus || Math.abs(new Date(other.actionAt) - new Date(h.actionAt)) < 120000)
                    );
                    if (hasSubsequentActionBySameUser) return false;
                  }
                  return true;
                });

                // استخراج تاییدکنندگان در انتظار (Pending) قبل از تکمیل پرونده
                const stepsProg = sub.stepsProgress ?? sub.StepsProgress ?? [];
                const pendingRows = [];
                if (!isCompletedOrRejected && stepsProg && stepsProg.length > 0) {
                  stepsProg.forEach(step => {
                    const stepStatus = step.status || step.Status;
                    if (stepStatus === 'Active' || stepStatus === 'Pending') {
                      const approversList = step.approvers || step.Approvers || [];
                      const unapproved = approversList.filter(a => (a.status || a.Status) === 'Pending');
                      unapproved.forEach(app => {
                        const isActive = stepStatus === 'Active';
                        pendingRows.push({
                          stepName: step.stepName || step.StepName || 'مرحله تایید',
                          fullName: app.fullName || app.FullName || `کاربر ${app.userId || app.UserId}`,
                          comments: isActive ? 'در انتظار بررسی و تایید' : 'در نوبت تایید (مراحل بعدی)',
                          isCurrentActive: isActive
                        });
                      });
                    }
                  });
                }

                const submitHistory = history.find(h => h.actionTaken === 'Submit' || h.actionTaken === 'SubmitDirect');
                const submitterName = (sub.submittedByUserName || sub.SubmittedByUserName || submitHistory?.actionByDisplayName || submitHistory?.actionByUserName || '').trim() || 'کاربر عمومی / مهمان';

                let rowCounter = 1;

                return (
                  <>
                    {/* ردیف اول: ثبت اولیه درخواست توسط متقاضی */}
                    <tr className="border-b border-slate-200 bg-white">
                      <td className="border border-slate-300 p-1.5 text-center font-mono">{rowCounter++}</td>
                      <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                        ثبت اولیه درخواست
                      </td>
                      <td className="border border-slate-300 p-1.5">{submitterName}</td>
                      <td className="border border-slate-300 p-1.5 font-mono text-[9px]">
                        {toPersianDateOnly(sub.submittedAt)} - {toPersianTimeOnly(sub.submittedAt)}
                      </td>
                      {block.showComments !== false && (
                        <td className="border border-slate-300 p-1.5 text-slate-500">
                          {hasDirectSubmit ? 'ثبت مستقیم و ایجاد پرونده' : 'ثبت توسط متقاضی'}
                        </td>
                      )}
                      <td className="border border-slate-300 p-1 text-center bg-slate-50/50">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ ثبت شد
                        </span>
                      </td>
                    </tr>

                    {/* ردیف‌های گردش‌کار: ۱ اقدام واقعی = ۱ ردیف */}
                    {workflowActions.map((h, aIdx) => {
                      const isApproved =
                        h.actionTaken === 'Approve' ||
                        h.actionTaken === 'Approved' ||
                        h.actionTaken === 'StepApprove' ||
                        h.actionTaken === 'StepApproved_Single' ||
                        h.actionTaken === 'FinalApprove';

                      const isActionRejected = h.actionTaken === 'Reject' || h.actionTaken === 'Rejected';
                      const isRefer = h.actionTaken === 'Refer';

                      const rawStepName = h.stepName || (h.previousStatus?.includes(':') ? h.previousStatus.split(':')[1]?.trim() : null);
                      const stepTitle = rawStepName || (
                        isApproved ? 'تایید مرحله' :
                        isActionRejected ? 'رد درخواست' :
                        isRefer ? 'ارجاع پرونده' : 'اقدام گردش‌کار'
                      );

                      const nameStr = (h.actionByDisplayName || h.actionByUserName || 'مسئول بررسی') + (h.actionByRole ? ` (${h.actionByRole})` : '');

                      return (
                        <tr key={h.historyId || aIdx} className="border-b border-slate-200 bg-white">
                          <td className="border border-slate-300 p-1.5 text-center font-mono">{rowCounter++}</td>
                          <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                            {stepTitle}
                          </td>
                          <td className="border border-slate-300 p-1.5">
                            {nameStr}
                          </td>
                          <td className="border border-slate-300 p-1.5 font-mono text-[9px]">
                            {toPersianDateOnly(h.actionAt)} - {toPersianTimeOnly(h.actionAt)}
                          </td>
                          {block.showComments !== false && (
                            <td className="border border-slate-300 p-1.5 text-slate-600">{h.comments || '—'}</td>
                          )}
                          <td className="border border-slate-300 p-1 text-center bg-slate-50/50">
                            {isApproved ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✓ تایید شده
                              </span>
                            ) : isActionRejected ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                ✕ رد شده
                              </span>
                            ) : isRefer ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                                ⮌ ارجاع شده
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                ⏳ در انتظار تایید
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {/* ردیف‌های تاییدکنندگان در انتظار قبل از تکمیل پرونده */}
                    {pendingRows.map((p, pIdx) => (
                      <tr key={`pending-${pIdx}`} className="border-b border-slate-200 bg-white">
                        <td className="border border-slate-300 p-1.5 text-center font-mono">{rowCounter++}</td>
                        <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                          {p.stepName}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-slate-800 font-medium">
                          {p.fullName}
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-[9px] text-slate-400 text-center">
                          —
                        </td>
                        {block.showComments !== false && (
                          <td className="border border-slate-300 p-1.5 text-slate-500 italic">
                            {p.comments}
                          </td>
                        )}
                        <td className="border border-slate-300 p-1 text-center bg-slate-50/50">
                          {p.isCurrentActive ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              ⏳ در انتظار تایید
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 rounded text-[9px] font-bold inline-block"
                              style={{ backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
                            >
                              🕒 در نوبت تایید
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* ردیف نهایی ثبت نهایی سیستمی پس از مختومه شدن فرآیند */}
                    {isCompleted && (
                      <tr className="border-b border-slate-200 bg-emerald-50/20">
                        <td className="border border-slate-300 p-1.5 text-center font-mono">{rowCounter++}</td>
                        <td className="border border-slate-300 p-1.5 font-bold text-emerald-900">
                          ثبت نهایی سیستمی
                        </td>
                        <td className="border border-slate-300 p-1.5 font-bold text-slate-800">
                          سیستمی
                        </td>
                        <td className="border border-slate-300 p-1.5 font-mono text-[9px]">
                          {toPersianDateOnly(sub.completedAt || sub.submittedAt)} - {toPersianTimeOnly(sub.completedAt || sub.submittedAt)}
                        </td>
                        {block.showComments !== false && (
                          <td className="border border-slate-300 p-1.5 text-slate-600">
                            {workflowActions.length > 0
                              ? 'تایید نهایی توسط تمامی مسئولین و مختومه شدن فرآیند'
                              : 'ثبت مستقیم و مختومه بدون نیاز به تایید'}
                          </td>
                        )}
                        <td className="border border-slate-300 p-1 text-center bg-slate-50/50">
                          <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ ثبت نهایی شده
                          </span>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      );
    }

    // ۶. کد QR اصالت‌سنجی (QR Code)
    if (block.type === 'qrCode') {
      return (
        <div className="flex items-center gap-3 p-1 w-full !text-slate-900">
          <div className="bg-white p-1.5 rounded border border-slate-200 shadow-2xs shrink-0">
            <QRCodeSVG
              value={`https://bpms.local/verify/${sub.trackingCode}`}
              size={54}
              level="M"
            />
          </div>
          <div className="flex-1 min-w-0" style={{ textAlign: bTextAlign }}>
            <span
              className={`font-bold ${titleColor} block w-full`}
              style={{ fontSize: `${bFontSizePx}px`, textAlign: bTextAlign }}
            >
              {block.title || 'کد اصالت‌سنجی سند'}
            </span>
            <span className={`text-[10px] font-mono ${labelColor} block mt-0.5`}>
              {sub.trackingCode}
            </span>
            <span className="text-[9px] !text-slate-600 block">
              جهت بررسی اصالت این سند در سامانه الکترونیک اسکن نمایید.
            </span>
          </div>
        </div>
      );
    }

    return null;
  };

  // تابع یکپارچه رندر بلوک با اعمال عرض، کادر دور، رنگ پس‌زمینه و فاصله داخلی
  const renderPdfBlock = (block, answers, sub, history = []) => {
    const isSec = block.type === 'sectionContainer' || block.type === 'sectionTitle';
    const widthClass = (block.colSpan === 2 || isSec)
      ? 'w-full'
      : block.colSpan === 3
      ? 'w-1/3'
      : 'w-1/2';

    const showBorder = block.showBorder !== false && block.hasBorder !== false;
    const borderColor = showBorder ? (block.borderStyle === 'dashed' || isSec ? '#94a3b8' : '#cbd5e1') : 'transparent';
    const borderStyle = showBorder ? (block.borderStyle || (isSec ? 'dashed' : 'solid')) : 'none';
    const borderWidth = showBorder ? ((block.borderStyle === 'dashed' || isSec) ? '1.5px' : '1px') : '0px';
    const backgroundColor = (block.bgColor && block.bgColor !== 'transparent' && block.bgColor !== 'default' && block.bgColor !== '#1e293b' && block.bgColor !== '#172554' && block.bgColor !== '#27272a' && block.bgColor !== '#064e3b' && block.bgColor !== '#451a03')
      ? block.bgColor
      : 'transparent';

    return (
      <div key={block.id} className={`${widthClass} px-1.5`}>
        <div
          className={`rounded-lg ${getPaddingClass(block.padding)} ${
            showBorder ? 'border' : 'border-0 border-transparent'
          } bg-white !text-slate-900`}
          style={{
            borderStyle,
            borderWidth,
            borderColor,
            backgroundColor: backgroundColor === 'transparent' ? '#ffffff' : backgroundColor
          }}
        >
          {renderPdfBlockContent(block, answers, sub, history)}
        </div>
      </div>
    );
  };

  const headerBlock = (activeTemplate?.blocks || []).find(b => b.type === 'header') || null;

  // تابع یکپارچه رندر یک برگ چاپی (هم برای پیش‌نمایش زنده در مودال و هم برای پرتال چاپ خارج از #root)
  const renderSheet = (sub, sIndex, pageNumber, isPortal) => {
    const answers = parseSubmissionAnswers(sub);

    const subId = sub.submissionID ?? sub.submissionId;
    const history = submissionHistories[subId] || [];
    const isLastPageOfSub = pageNumber === totalPages;
    const isLastSub = sIndex === submissions.length - 1;
    const isFinalSheetOverall = isLastSub && isLastPageOfSub;

    // بلوک‌های بدنه این صفحه
    const pageBodyBlocks = (activeTemplate?.blocks || []).filter(b => {
      const bPage = b.page || 1;
      const bZone = b.zone || (b.type === 'header' ? 'header' : (b.type === 'signatures' || b.type === 'qrCode') ? 'footer' : 'body');
      return bPage === pageNumber && bZone === 'body';
    });

    // نمایش پاورقی: اگر تمام صفحات باشد یا صفحه آخر باشد
    const showFooterOnThisPage = (activeTemplate?.footerPosition === 'allPages') || (pageNumber === totalPages);
    const pageFooterBlocks = showFooterOnThisPage
      ? (activeTemplate?.blocks || []).filter(b => {
          const bZone = b.zone || (b.type === 'header' ? 'header' : (b.type === 'signatures' || b.type === 'qrCode') ? 'footer' : 'body');
          return bZone === 'footer';
        })
      : [];

    const sheetStyle = isPortal
      ? {
          backgroundColor: '#ffffff',
          color: '#0f172a',
          colorScheme: 'light',
          width: '100%',
          minHeight: `${basePxHeight}px`,
          boxSizing: 'border-box',
          paddingTop: `${marginTop}mm`,
          paddingBottom: `${marginBottom}mm`,
          paddingLeft: `${marginLeft}mm`,
          paddingRight: `${marginRight}mm`,
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
          pageBreakAfter: !isFinalSheetOverall ? 'always' : 'auto',
          breakAfter: !isFinalSheetOverall ? 'page' : 'auto',
        }
      : {
          backgroundColor: '#ffffff',
          color: '#0f172a',
          colorScheme: 'light',
          width: `${basePxWidth}px`,
          minHeight: `${basePxHeight}px`,
          padding: `${marginTop * 3.78}px ${marginRight * 3.78}px ${marginBottom * 3.78}px ${marginLeft * 3.78}px`
        };

    return (
      <div
        key={`sub_${sub.submissionID ?? sub.submissionId ?? sIndex}_p_${pageNumber}${isPortal ? '_portal' : ''}`}
        className={`bpms-print-sheet bg-white !text-slate-900 relative flex flex-col font-['IRANSansX','IRANSans','Vazirmatn',sans-serif] ${
          !isPortal ? 'shadow-2xl rounded-sm border border-slate-300' : ''
        } ${!isFinalSheetOverall ? 'print-break-after' : ''}`}
        style={sheetStyle}
      >
        {/* نشانگر اندازه و صفحه در محیط پیش‌نمایش */}
        {!isPortal && (
          <div className="no-print absolute top-2 left-2 text-[9px] font-mono text-slate-500 opacity-75">
            {curPaperSize} {curOrientation === 'portrait' ? 'PORTRAIT' : 'LANDSCAPE'} | برگه {pageNumber} از {totalPages}
          </div>
        )}

        {/* ناحیه ۱: سربرگ رسمی (Header Zone) */}
        <div className="mb-4 !text-slate-900">
          {pageNumber === 1 ? (
            headerBlock && (
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
                      {activeTemplate.name}
                    </span>
                  </div>

                  <div className="text-left text-[10px] !text-slate-700 font-mono space-y-0.5">
                    {headerBlock.showTrackingCode && (
                      <div>
                        <span>کد رهگیری: </span>
                        <b className="!text-slate-900 font-bold">{sub.trackingCode}</b>
                      </div>
                    )}
                    {headerBlock.showDate && (
                      <div>
                        <span>تاریخ ثبت: </span>
                        <span className="!text-slate-900">{toPersianDateOnly(sub.submittedAt)}</span>
                      </div>
                    )}
                    <div>
                      <span>وضعیت: </span>
                      <span className="font-bold !text-slate-900">{formatWorkflowStatus(sub.workflowStatus)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            // تکرار خودکار سربرگ در بالای صفحات بعدی
            activeTemplate?.repeatHeaderOnAllPages !== false && headerBlock ? (
              <div className="pb-2.5 mb-2 border-b border-slate-300">
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
                    <b className="!text-slate-900">{sub.trackingCode}</b>
                  </div>
                </div>
              </div>
            ) : null
          )}
        </div>

        {/* ناحیه ۲: بدنه و محتوا (Body Zone) */}
        {(() => {
          const fieldsInContainers = new Set();
          pageBodyBlocks.forEach(b => {
            if ((b.type === 'sectionContainer' || b.type === 'sectionTitle') && Array.isArray(b.fieldIds)) {
              b.fieldIds.forEach(id => fieldsInContainers.add(id));
            }
          });

          const renderableBodyBlocks = pageBodyBlocks.filter(b => {
            if (b.type === 'field' && fieldsInContainers.has(b.fieldId)) {
              return false; // فیلد درون کادر سکشن چاپ می‌شود، بنابراین تکرار نشود
            }
            return true;
          });

          return (
            <div className="flex flex-wrap gap-y-3 -mx-1.5 flex-1 content-start">
              {renderableBodyBlocks.map((block) => renderPdfBlock(block, answers, sub, history))}
            </div>
          );
        })()}

        {/* ناحیه اختصاصی: باکس‌های محاسبات و خلاصه فرمولی (Calculated Boxes) */}
        {showFooterOnThisPage && activeTemplate?.calculatedBoxes && activeTemplate.calculatedBoxes.length > 0 && (
          <CalculatedBoxesGrid
            boxes={activeTemplate.calculatedBoxes}
            answers={answers}
            formQuestions={formQuestions}
          />
        )}

        {/* ناحیه ۳: پاورقی و تاییدات نهایی (Footer Zone) */}
        {showFooterOnThisPage && pageFooterBlocks.length > 0 && (
          <div className="mt-6 pt-3 border-t border-slate-200 space-y-3">
            <div className="flex flex-wrap gap-y-3 -mx-1.5">
              {pageFooterBlocks.map((block) => renderPdfBlock(block, answers, sub, history))}
            </div>
          </div>
        )}

        {/* ========================================================
            ناحیه اختصاصی: جدول رسمی پیوست‌های پرونده، بارکد QR و تصاویر پیوست
            ======================================================== */}
        {showFooterOnThisPage && (() => {
          const attachmentsList = extractAttachmentsFromSubmission(sub, answers);
          if (attachmentsList.length === 0) return null;
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const imageAttachments = attachmentsList.filter(a => a.isImage);

          return (
            <div className="mt-4 pt-3 border-t border-slate-300 space-y-3 !text-slate-900" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 !text-slate-900 font-bold text-[11px]">
                  <FolderArchive className="w-3.5 h-3.5 text-blue-600" />
                  <span className="!text-slate-900">جدول رسمی پیوست‌های پرونده (کد رهگیری: {sub.trackingCode})</span>
                </div>
                <span className="text-[9px] font-mono !text-slate-700">
                  {attachmentsList.length} سند پیوست‌شده
                </span>
              </div>

              <div className="flex items-start gap-3">
                {/* جدول اسناد پیوست */}
                <div className="flex-1 overflow-x-auto border border-slate-300 rounded-lg">
                  <table className="w-full text-right text-[10px] border-collapse bg-white !text-slate-900">
                    <thead className="bg-slate-100 !text-slate-900 font-bold border-b border-slate-300">
                      <tr>
                        <th className="p-1.5 w-8 text-center border-l border-slate-300 !text-slate-900">#</th>
                        <th className="p-1.5 border-l border-slate-300 !text-slate-900">نام اصلی فایل</th>
                        <th className="p-1.5 w-24 text-center border-l border-slate-300 !text-slate-900">نوع / پسوند</th>
                        <th className="p-1.5 w-28 text-center !text-slate-900">لینک مستقیم دانلود</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {attachmentsList.map((att, aIdx) => (
                        <tr key={aIdx} className={aIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                          <td className="p-1.5 text-center font-mono !text-slate-700 border-l border-slate-300">
                            {aIdx + 1}
                          </td>
                          <td className="p-1.5 font-medium !text-slate-900 border-l border-slate-300">
                            <div className="flex items-center gap-1.5">
                              {getFileIcon(att.extension, att.isImage)}
                              <span className="truncate max-w-[240px] block !text-slate-900" title={att.name}>
                                {att.name}
                              </span>
                            </div>
                          </td>
                          <td className="p-1.5 text-center border-l border-slate-300">
                            <span
                              className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                              style={{ backgroundColor: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1' }}
                            >
                              {att.extension}
                            </span>
                          </td>
                          <td className="p-1.5 text-center">
                            <a
                              href={`/attachments/${encodeURIComponent(sub.trackingCode || '')}`}
                              onClick={async (e) => {
                                e.preventDefault();
                                await handleDownloadAttachment(att);
                              }}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 text-[10px] font-semibold underline cursor-pointer"
                              title={`دریافت فایل ${att.name}`}
                            >
                              <span>دریافت فایل</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* بارکد QR اختصاصی دریافت پیوست‌های پرونده */}
                <div className="w-32 shrink-0 border border-slate-300 rounded-lg p-2 bg-white flex flex-col items-center justify-center text-center shadow-2xs !text-slate-900">
                  <QRCodeSVG
                    value={`${origin}/attachments/${encodeURIComponent(sub.trackingCode || '')}`}
                    size={58}
                    level="M"
                  />
                  <span className="text-[9px] font-bold !text-slate-900 mt-1 block">
                    پیوست‌های پرونده
                  </span>
                  <span className="text-[7px] !text-slate-700 font-mono block">
                    اسکن جهت دانلود
                  </span>
                </div>
              </div>

              {/* نمایش تصاویر پیوست در انتهای برگه (بر اساس آپشن showImageAttachments) */}
              {showImageAttachments && imageAttachments.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-dashed border-slate-200" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <span className="text-[10px] font-bold text-slate-700 block mb-1.5">
                    تصاویر پیوست پرونده:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {imageAttachments.map((imgAtt, iIdx) => (
                      <div
                        key={iIdx}
                        className="border border-slate-300 rounded-lg p-1.5 bg-white text-center space-y-1 shadow-2xs"
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                      >
                        <div className="h-28 rounded bg-slate-50 flex items-center justify-center overflow-hidden border border-slate-200">
                          <AuthImage
                            src={imgAtt.downloadUrl}
                            alt={imgAtt.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <span className="text-[9px] text-slate-600 truncate block font-mono px-1" title={imgAtt.name}>
                          {imgAtt.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* فوتر رسمی برگه با شماره صفحه */}
        <div className="mt-auto pt-3 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400 font-mono">
          <span>نوافلو (NovaFlow) — سامانه یکپارچه مدیریت فرآیندهای سازمانی</span>
          <span>کد رهگیری: {sub.trackingCode}</span>
          <span className="font-bold text-slate-600">برگه {pageNumber} از {totalPages}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div id="bpms-pdf-preview-modal" data-pdf-preview-modal="true" className="fixed inset-0 z-50 flex flex-col bg-slate-900/85 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
        {/* نوار ابزار بالا */}
        <div className="bg-slate-900 text-white border-b border-slate-700/80 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0 shadow-md">
          <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-100 block truncate">پیش‌نمایش زنده و صدور PDF سازمانی</span>
                  <span className="text-[10px] text-slate-400 max-w-full sm:max-w-[200px] truncate block">فرم: {form.title}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="sm:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer shrink-0"
                title="بستن پنجره"
                aria-label="بستن پنجره پیش‌نمایش PDF"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-1 hidden sm:block" />

            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0 w-full sm:w-auto">
              <label className="text-[11px] text-slate-400 shrink-0 whitespace-nowrap">انتخاب قالب چاپ:</label>
              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                <select
                  value={selectedTemplateId || ''}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full sm:w-auto min-w-0 max-w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-1.5 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.paperSize} {t.orientation === 'portrait' ? 'عمودی' : 'افقی'})
                    </option>
                  ))}
                </select>

                {onOpenDesigner && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDesigner();
                    }}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition shrink-0 whitespace-nowrap cursor-pointer"
                    title="ویرایش یا بازطراحی این قالب"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>ویرایش قالب</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* مرکز: کنترل‌های پیمایش */}
          {submissions.length > 1 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-slate-800/90 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode(v => v === 'all' ? 'single' : 'all')}
                  className="text-[11px] font-medium text-slate-300 hover:text-white"
                >
                  {viewMode === 'all' ? `نمایش پیوسته (${submissions.length} مورد)` : `مورد ${currentPreviewIndex + 1} از ${submissions.length}`}
                </button>

                {viewMode === 'single' && (
                  <div className="flex items-center gap-0.5 mr-1 border-r border-slate-700 pr-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPreviewIndex(p => Math.max(0, p - 1))}
                      disabled={currentPreviewIndex === 0}
                      className="p-0.5 hover:text-white disabled:opacity-30"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPreviewIndex(p => Math.min(submissions.length - 1, p + 1))}
                      disabled={currentPreviewIndex === submissions.length - 1}
                      className="p-0.5 hover:text-white disabled:opacity-30"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* چپ: کنترل زوم و دکمه‌های پرینت */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <div className="hidden md:flex items-center gap-1 bg-slate-800/90 px-2 py-1 rounded-xl border border-slate-700 text-xs text-slate-300">
              <button
                type="button"
                onClick={() => setZoomScale(z => Math.max(0.4, z - 0.1))}
                className="p-1 hover:text-white cursor-pointer"
                title="کوچک‌نمایی"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] w-9 text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale(z => Math.min(1.4, z + 0.1))}
                className="p-1 hover:text-white cursor-pointer"
                title="بزرگ‌نمایی"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* سوییچ نمایش تصاویر پیوست در انتهای برگه چاپی PDF (فقط در صورت وجود پیوست واقعی) */}
            {hasAnyAttachments && (
              <button
                type="button"
                onClick={() => setShowImageAttachments(!showImageAttachments)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer shrink-0 ${
                  showImageAttachments
                    ? 'bg-purple-900/60 border-purple-500/50 text-purple-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="نمایش تصاویر پیوست در انتهای برگه چاپی PDF (پیش‌فرض غیرفعال)"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">نمایش تصاویر پیوست در PDF:</span>
                <span className="font-bold">{showImageAttachments ? 'فعال' : 'غیرفعال'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 sm:py-1.5 rounded-xl font-bold transition shadow-xs cursor-pointer whitespace-nowrap"
              title="چاپ یا ذخیره به صورت PDF با کیفیت برداری بدون افت کیفیت"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>چاپ / صدور فایل PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="بستن پنجره"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* محتوای پیش‌نمایش در بوم مرکزی */}
        <div
          ref={previewWrapperRef}
          className="bpms-printable-wrapper flex-1 overflow-auto p-2.5 sm:p-6 md:p-10 flex flex-col items-center bg-slate-950/70"
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
              ref={printableAreaRef}
              id="bpms-printable-area"
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
              className="space-y-8 sm:space-y-12"
            >
            {submissions.map((sub, sIndex) => {
              const isVisibleOnScreen = viewMode === 'all' || sIndex === currentPreviewIndex;
              if (!isVisibleOnScreen) return null;

              return (
                <div
                  key={sub.submissionID ?? sub.submissionId ?? sIndex}
                  className="bpms-submission-group space-y-12"
                >
                  {Array.from({ length: totalPages }).map((_, pIdx) =>
                    renderSheet(sub, sIndex, pIdx + 1, false)
                  )}
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>

      {/* پرتال اختصاصی چاپ خارج از #root مستقیماً متصل به document.body */}
      {typeof document !== 'undefined' && createPortal(
        <div id="bpms-print-portal">
          {submissions.map((sub, sIndex) => (
            <div
              key={`portal_sub_${sub.submissionID ?? sub.submissionId ?? sIndex}`}
              className="bpms-submission-group"
            >
              {Array.from({ length: totalPages }).map((_, pIdx) =>
                renderSheet(sub, sIndex, pIdx + 1, true)
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
