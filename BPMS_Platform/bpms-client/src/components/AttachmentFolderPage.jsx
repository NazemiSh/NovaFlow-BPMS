import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderArchive,
  File,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Download,
  DownloadCloud,
  Eye,
  Search,
  Home,
  Copy,
  Check,
  RefreshCw,
  AlertCircle,
  Lock,
  LogIn,
  ShieldCheck,
  Grid,
  List,
  Calendar,
  HardDrive,
  X,
  ExternalLink,
  ChevronLeft,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import api from '../api';
import { toPersianDateOnly, toPersianTimeOnly } from './PersianDatePicker';
import AuthImage from './AuthImage';
import { useDialog } from './GlobalDialogProvider';

export default function AttachmentFolderPage({ trackingCode: initialTrackingCode, branding = {}, theme = 'system', cycleTheme = null }) {
  const { toast } = useDialog();
  const [trackingCode, setTrackingCode] = useState(initialTrackingCode || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusCode, setStatusCode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [downloadingZip, setDownloadingZip] = useState(false);

  // استخراج کد رهگیری از URL در صورتی که از پراپس پاس نشده باشد
  useEffect(() => {
    if (!trackingCode && typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/attachments\/([^/?#]+)/);
      if (match && match[1]) {
        setTrackingCode(decodeURIComponent(match[1]));
      }
    }
  }, [trackingCode]);

  // ذخیره خودکار مسیر فعلی در صورت عدم احراز هویت جهت بازگشت مستقیم پس از لاگین
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('bpms_token');
      if (!token) {
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('bpms_post_login_redirect', currentPath);
      }
    }
  }, []);

  const loadAttachments = async () => {
    if (!trackingCode) return;
    setLoading(true);
    setError(null);
    setStatusCode(null);
    try {
      const res = await api.get(`/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments`);
      setData(res.data);
    } catch (err) {
      console.error('Error fetching attachments:', err);
      const code = err.response?.status || 500;
      setStatusCode(code);
      if (code === 401 && typeof window !== 'undefined') {
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('bpms_post_login_redirect', currentPath);
      }
      const msg = err.response?.data?.message ||
        (code === 401 ? 'جهت مشاهده پیوست‌های این پرونده، لطفاً ابتدا وارد سامانه شوید.' :
         code === 403 ? 'شما مجوز دسترسی به پیوست‌های این پرونده را ندارید.' :
         code === 404 ? 'پرونده‌ای با این کد رهگیری در سامانه یافت نشد.' :
         'خطا در دریافت اطلاعات پیوست‌های پرونده.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trackingCode) {
      loadAttachments();
    }
  }, [trackingCode]);

  const handleCopyTrackingCode = () => {
    if (!trackingCode) return;
    navigator.clipboard?.writeText(trackingCode);
    setCopiedTracking(true);
    setTimeout(() => setCopiedTracking(false), 2000);
  };

  const handleDownloadFile = async (att) => {
    if (!att) return;
    try {
      const token = localStorage.getItem('bpms_token');
      const targetUrl = att.downloadUrl || `/api/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments/download?fileName=${encodeURIComponent(att.fileName || att.originalFileName)}`;
      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.originalFileName || att.fileName || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Error downloading attachment:', err);
      toast.error('خطا در دانلود فایل پیوست.');
    }
  };

  const handleDownloadZip = async () => {
    if (!trackingCode || downloadingZip) return;
    setDownloadingZip(true);
    try {
      const token = localStorage.getItem('bpms_token');
      const res = await fetch(`/api/submissions/by-tracking/${encodeURIComponent(trackingCode)}/attachments/zip`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        let errJson = null;
        try { errJson = await res.json(); } catch {}
        throw new Error(errJson?.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attachments_${trackingCode}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Error downloading zip:', err);
      toast.error(err.message || 'خطا در دانلود فایل فشرده پیوست‌ها. ممکن است فایل فیزیکی در سرور موجود نباشد.');
    } finally {
      setDownloadingZip(false);
    }
  };

  const getFileIcon = (ext = '', isImage = false) => {
    const e = ext.toUpperCase().replace('.', '');
    if (isImage || ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'SVG', 'BMP'].includes(e)) {
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    }
    if (['PDF'].includes(e)) {
      return <FileText className="w-5 h-5 text-rose-500" />;
    }
    if (['XLS', 'XLSX', 'CSV'].includes(e)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    }
    if (['DOC', 'DOCX'].includes(e)) {
      return <FileText className="w-5 h-5 text-blue-500" />;
    }
    if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(e)) {
      return <FolderArchive className="w-5 h-5 text-amber-500" />;
    }
    return <File className="w-5 h-5 text-slate-400" />;
  };

  const getBadgeColor = (ext = '') => {
    const e = ext.toUpperCase().replace('.', '');
    if (['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(e)) return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    if (['PDF'].includes(e)) return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    if (['XLS', 'XLSX', 'CSV'].includes(e)) return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    if (['DOC', 'DOCX'].includes(e)) return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    if (['ZIP', 'RAR', '7Z'].includes(e)) return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  const formatUploadedDate = (dateVal) => {
    if (!dateVal) return '—';
    try {
      const d = new Date(dateVal);
      return `${toPersianDateOnly(d)} ${toPersianTimeOnly(d)}`;
    } catch {
      return String(dateVal);
    }
  };

  const filteredAttachments = useMemo(() => {
    if (!data?.attachments) return [];
    if (!searchQuery.trim()) return data.attachments;
    const q = searchQuery.trim().toLowerCase();
    return data.attachments.filter(
      (a) =>
        (a.originalFileName && a.originalFileName.toLowerCase().includes(q)) ||
        (a.fileName && a.fileName.toLowerCase().includes(q)) ||
        (a.extension && a.extension.toLowerCase().includes(q))
    );
  }, [data?.attachments, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col antialiased">
      {/* هدر بالایی با ناوبری و برندینگ سامانه */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* مسیر ناوبری (Breadcrumb) */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <a
              href="/"
              className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-sky-400 transition font-medium"
            >
              <Home className="w-4 h-4" />
              <span>خانه</span>
            </a>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
            <span className="text-slate-600 dark:text-slate-300 font-medium hidden sm:inline">پیوست‌های پرونده</span>
            <ChevronLeft className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 hidden sm:inline" />
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
              <Folder className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
              <span className="font-mono font-bold text-xs text-blue-700 dark:text-sky-300">{trackingCode}</span>
              <button
                type="button"
                onClick={handleCopyTrackingCode}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-0.5"
                title="کپی کد رهگیری"
              >
                {copiedTracking ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </nav>

          {/* برندینگ و لوگوی نوافلو + دکمه سوییچ تم */}
          <div className="flex items-center gap-2 sm:gap-3">
            {cycleTheme && (
              <button
                type="button"
                onClick={cycleTheme}
                title={`حالت تم: ${theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم'} (کلیک جهت تغییر)`}
                aria-label="تغییر تم روشن و تاریک"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-xs font-medium cursor-pointer shadow-2xs"
              >
                {theme === 'dark' && <Moon className="w-4 h-4 text-blue-400 shrink-0" />}
                {theme === 'light' && <Sun className="w-4 h-4 text-amber-500 shrink-0" />}
                {theme === 'system' && <Monitor className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
                <span className="hidden sm:inline">
                  {theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم'}
                </span>
              </button>
            )}
            <div className="text-left hidden md:block">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                {branding?.systemTitle || 'سامانه یکپارچه نوافلو'}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                {branding?.companyName || 'NovaFlow Enterprise BPMS'}
              </span>
            </div>
            <img
              src={branding?.logoUrl || '/uploads/logo.png'}
              alt="Logo"
              className="h-9 w-auto max-w-[120px] object-contain rounded"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          </div>
        </div>
      </header>

      {/* محتوای اصلی صفحه */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6">
        {/* حالت بارگذاری اولیه */}
        {loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center shadow-xs space-y-4">
            <RefreshCw className="w-8 h-8 text-blue-600 dark:text-sky-400 animate-spin mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              در حال دریافت و کاوش فایل‌های پیوست پرونده...
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              سامانه در حال بررسی دسترسی و استخراج متادیتای اسناد بارگذاری‌شده برای کد رهگیری {trackingCode} می‌باشد.
            </p>
          </div>
        )}

        {/* حالت خطا (۴۰۱ / ۴۰۳ / ۴۰۴ یا خطای سرور) */}
        {!loading && error && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 md:p-12 text-center shadow-xs max-w-xl mx-auto space-y-4 animate-in fade-in">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-200 dark:border-rose-800">
              {statusCode === 401 || statusCode === 403 ? <Lock className="w-7 h-7" /> : <AlertCircle className="w-7 h-7" />}
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {statusCode === 401 ? 'نیاز به احراز هویت' :
               statusCode === 403 ? 'عدم دسترسی به پرونده' :
               statusCode === 404 ? 'پرونده یافت نشد' : 'خطای ارتباط با سرور'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex items-center justify-center gap-3">
              {statusCode === 401 ? (
                <a
                  href={`/?returnUrl=${encodeURIComponent(typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '')}`}
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      const currentPath = window.location.pathname + window.location.search;
                      sessionStorage.setItem('bpms_post_login_redirect', currentPath);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                >
                  <LogIn className="w-4 h-4" />
                  <span>ورود به سامانه و مشاهده پیوست‌ها</span>
                </a>
              ) : (
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                >
                  <Home className="w-4 h-4" />
                  <span>بازگشت به صفحه اصلی</span>
                </a>
              )}
              <button
                type="button"
                onClick={loadAttachments}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-xl transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          </div>
        )}

        {/* نمایش موفق اطلاعات پوشه فایل‌ها */}
        {!loading && !error && data && (
          <>
            {/* بنر خلاصه پرونده و دکمه دانلود همه فایل‌ها (ZIP) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 border border-blue-200/60 dark:border-blue-800/60">
                      <FolderArchive className="w-5 h-5" />
                    </div>
                    <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-slate-100">
                      پوشه اسناد و پیوست‌های پرونده
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      امن و محافظت‌شده
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    فرم: <span className="font-semibold text-slate-700 dark:text-slate-200">{data.formTitle}</span> |
                    کد رهگیری: <span className="font-mono font-bold text-blue-600 dark:text-sky-400 mr-1">{data.trackingCode}</span>
                  </p>
                </div>

                {/* دکمه عملیاتی اصلی: دانلود همه فایل‌ها به صورت ZIP */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    disabled={downloadingZip || (data.attachments && data.attachments.length === 0)}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title="فشرده‌سازی درلحظه تمام پیوست‌های این پرونده و دانلود فایل ZIP"
                  >
                    {downloadingZip ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <DownloadCloud className="w-4 h-4" />
                    )}
                    <span>{downloadingZip ? 'در حال ایجاد فایل ZIP...' : 'دانلود همه فایل‌ها (ZIP)'}</span>
                  </button>
                </div>
              </div>

              {/* کارت‌های آماری متادیتا */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400 block mb-1">تعداد فایل‌های پیوست</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 font-mono">
                    {data.totalCount ?? data.attachments?.length ?? 0} فایل
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400 block mb-1">حجم کل اسناد</span>
                  <span className="text-base font-bold text-slate-800 dark:text-slate-100 font-mono">
                    {data.totalSizeFormatted || '۰ KB'}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400 block mb-1">ثبت‌کننده پرونده</span>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate block">
                    {data.submittedBy || 'ناشناس'}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                  <span className="text-slate-400 block mb-1">تاریخ ثبت درخواست</span>
                  <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 block truncate">
                    {formatUploadedDate(data.submittedAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* نوار جستجو و تعویض نمای جدول / کارت */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800">
              {/* جعبه جستجو */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="جستجو در نام یا پسوند فایل‌ها..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* سوییچ نما و تازه‌سازی */}
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                    title="نمای جدولی"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-sky-400 shadow-2xs font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                    title="نمای کارتی"
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={loadAttachments}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
                  title="به‌روزرسانی فهرست"
                  aria-label="تازه‌سازی فهرست پیوست‌ها"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* محتوای فایل‌ها */}
            {filteredAttachments.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center shadow-xs space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <Folder className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  {searchQuery ? 'فایلی مطابق با عبارت جستجو یافت نشد' : 'هیچ فایل پیوستی در این پرونده ثبت نشده است'}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? 'لطفاً عبارت دیگری را جستجو کرده یا فیلتر را پاک نمایید.'
                    : 'درخواست‌دهنده هنگام تکمیل این فرم، فایلی را بارگذاری نکرده است.'}
                </p>
              </div>
            ) : viewMode === 'list' ? (
              /* نمای جدولی استاندارد (Web File Explorer Directory) */
              <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700/80">
                      <tr>
                        <th className="py-3 px-3 w-12 text-center">#</th>
                        <th className="py-3 px-4">نام فایل</th>
                        <th className="py-3 px-3 text-center">نوع / پسوند</th>
                        <th className="py-3 px-4">تاریخ بارگذاری</th>
                        <th className="py-3 px-4 text-left">حجم</th>
                        <th className="py-3 px-4 text-center w-32">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredAttachments.map((att, idx) => (
                        <tr
                          key={att.fileName || idx}
                          className="hover:bg-blue-50/40 dark:hover:bg-slate-800/40 transition group"
                        >
                          <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="shrink-0">
                                {getFileIcon(att.extension, att.isImage)}
                              </div>
                              <div className="min-w-0 max-w-xs sm:max-w-md truncate">
                                <span
                                  className="font-medium text-slate-800 dark:text-slate-200 text-xs block truncate"
                                  title={att.originalFileName || att.fileName}
                                >
                                  {att.originalFileName || att.fileName}
                                </span>
                                {att.fileName !== att.originalFileName && (
                                  <span className="font-mono text-[10px] text-slate-400 block truncate">
                                    {att.fileName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono border ${getBadgeColor(
                                att.extension
                              )}`}
                            >
                              {att.extension || 'FILE'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 text-[11px]">
                            {formatUploadedDate(att.uploadedAt)}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 text-[11px] text-left">
                            {att.sizeFormatted || '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {att.isImage && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewFile(att)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/50 transition"
                                  title="پیش‌نمایش تصویر"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownloadFile(att)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-blue-200/80 dark:border-blue-900/60 transition shadow-2xs cursor-pointer"
                                title="دانلود فایل"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>دانلود</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* نمای کارتی (Grid View) */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredAttachments.map((att, idx) => (
                  <div
                    key={att.fileName || idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-3 group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {getFileIcon(att.extension, att.isImage)}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono border ${getBadgeColor(
                            att.extension
                          )}`}
                        >
                          {att.extension || 'FILE'}
                        </span>
                      </div>
                      <h4
                        className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed"
                        title={att.originalFileName || att.fileName}
                      >
                        {att.originalFileName || att.fileName}
                      </h4>
                    </div>

                    {att.isImage && (
                      <div
                        onClick={() => setPreviewFile(att)}
                        className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden relative group cursor-pointer border border-slate-200 dark:border-slate-700/60"
                      >
                        <AuthImage
                          src={att.downloadUrl}
                          alt={att.originalFileName}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs gap-1 font-bold">
                          <Eye className="w-4 h-4" />
                          <span>بزرگ‌نمایی</span>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>{att.sizeFormatted}</span>
                      <span>{toPersianDateOnly(att.uploadedAt)}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadFile(att)}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-2xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود فایل</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* مودال پیش‌نمایش تصویر (Lightbox) */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full p-4 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {previewFile.originalFileName || previewFile.fileName}
              </span>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl flex items-center justify-center bg-slate-950/10 dark:bg-slate-950/50 p-2">
              <AuthImage
                src={previewFile.downloadUrl}
                alt={previewFile.originalFileName}
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-slate-400">
                حجم: {previewFile.sizeFormatted} | پسوند: {previewFile.extension}
              </span>
              <button
                type="button"
                onClick={() => handleDownloadFile(previewFile)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود مستقیم</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* فوتر ساده و امن */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          سامانه جامع مدیریت فرآیندهای کسب‌وکار نوافلو (NovaFlow BPMS) — کاوشگر امن اسناد پرونده
        </div>
      </footer>
    </div>
  );
}
