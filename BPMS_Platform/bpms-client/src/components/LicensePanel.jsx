import React, { useState, useEffect } from 'react';
import api from '../api';
import { QRCodeSVG } from 'qrcode.react';
import {
  Key,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Building2,
  Users,
  Calendar,
  Sparkles,
  Phone,
  Mail,
  Globe,
  RefreshCw,
  Cpu,
  Info,
  Trash2,
  MessageCircle,
  ExternalLink,
  ArrowUpCircle,
  Download
} from 'lucide-react';
import { useDialog } from './GlobalDialogProvider';

export default function LicensePanel() {
  const { confirm } = useDialog();
  const hideDevContact = import.meta.env.VITE_HIDE_DEV_CONTACT === 'true';
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [statusData, setStatusData] = useState(null);
  const [licenseInput, setLicenseInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const fetchLicenseStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/license/status');
      setStatusData(res.data);
      setFeedback(null);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'خطا در دریافت وضعیت لایسنس: ' + (err.response?.data?.message || err.message)
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUpdateInfo = async (force = false) => {
    try {
      setCheckingUpdate(true);
      const res = await api.get(`/admin/license/check-update${force ? '?force=true' : ''}`);
      setUpdateInfo(res.data);
    } catch (err) {
      setUpdateInfo({
        status: 'Offline',
        currentVersion: '1.0.0',
        hasUpdate: false,
        message: 'سرور به اینترنت دسترسی ندارد (شبکه ایزوله یا ارتباط محدود است).'
      });
    } finally {
      setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();
    fetchUpdateInfo();
  }, []);

  const handleCopyMachineId = async () => {
    if (!statusData?.machineId) return;
    try {
      await navigator.clipboard.writeText(statusData.machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textArea = document.createElement('textarea');
      textArea.value = statusData.machineId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!licenseInput.trim()) {
      setFeedback({ type: 'error', text: 'لطفاً کلید لایسنس دریافتی را وارد نمایید.' });
      return;
    }

    try {
      setActivating(true);
      setFeedback(null);
      const res = await api.post('/admin/license/activate', { licenseKey: licenseInput.trim() });
      setFeedback({ type: 'success', text: res.data.message || 'لایسنس با موفقیت فعال شد.' });
      setLicenseInput('');
      if (res.data.status) {
        setStatusData(res.data.status);
      } else {
        await fetchLicenseStatus();
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'فعال‌سازی لایسنس ناموفق بود: ' + (err.response?.data?.message || err.message)
      });
    } finally {
      setActivating(false);
    }
  };

  const handleRemoveLicense = async () => {
    const confirmed = await confirm({
      title: 'حذف لایسنس فعال',
      message: 'آیا از حذف لایسنس فعال و بازگردانی سامانه به وضعیت ارزیابی (Trial) اطمینان دارید؟',
      confirmText: 'تایید و حذف لایسنس',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }
    try {
      setRemoving(true);
      setFeedback(null);
      const res = await api.delete('/admin/license');
      setFeedback({
        type: 'success',
        text: res.data.message || 'لایسنس با موفقیت حذف گردید و سامانه به وضعیت ارزیابی بازگشت.'
      });
      if (res.data.status) {
        setStatusData(res.data.status);
      } else {
        await fetchLicenseStatus();
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'خطا در حذف لایسنس: ' + (err.response?.data?.message || err.message)
      });
    } finally {
      setRemoving(false);
    }
  };

  if (loading && !statusData) {
    return (
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-8 bg-white dark:bg-[#252736] flex items-center justify-center gap-3 text-slate-500 dark:text-slate-300">
        <RefreshCw className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span className="text-sm">در حال بارگذاری وضعیت لایسنس سرور...</span>
      </div>
    );
  }

  const isTrial = statusData?.isTrial || statusData?.status === 'Trial';
  const isActive = statusData?.status === 'Active';
  const isExpired = statusData?.status === 'Expired';

  const userUsagePercent = statusData?.maxUsers
    ? Math.min(100, Math.round((statusData.activeUsersCount / statusData.maxUsers) * 100))
    : 0;

  return (
    <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl bg-white dark:bg-[#252736] shadow-xs overflow-hidden mt-6">
      {/* هدر بخش لایسنس */}
      <div className="px-4 py-3.5 sm:px-6 sm:py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h4 className="font-bold text-base flex items-center gap-2">
              <span>مدیریت لایسنس سخت‌افزاری و اطلاعات مالکیت سامانه</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-indigo-200">
                v{statusData?.version || '1.0.0'}
              </span>
            </h4>
            <p className="text-xs text-slate-300">
              اعتبارسنجی با امضای دیجیتال امن بر اساس مشخصات پایدار سخت‌افزار سرور
            </p>
          </div>
        </div>

        <div>
          {isActive && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              لایسنس رسمی و فعال
            </span>
          )}
          {isTrial && !isExpired && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              نسخه ارزیابی آزمایشی ({statusData?.daysRemaining} روز باقیمانده)
            </span>
          )}
          {isExpired && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
              <XCircle className="w-4 h-4 text-rose-400" />
              لایسنس منقضی شده
            </span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* نوار اعلان وجود نسخه جدید روی مخزن گیت‌هاب (بخش ۸-۴) */}
        {updateInfo?.hasUpdate && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-blue-950/30 border border-emerald-300 dark:border-emerald-700/60 shadow-xs space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <ArrowUpCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-emerald-950 dark:text-emerald-200 text-sm">
                      {updateInfo.title || 'نگارش جدید سامانه در دسترس است!'}
                    </span>
                    <span dir="ltr" className="text-xs font-mono font-bold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                      v{updateInfo.latestVersion}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                    نسخه فعلی سرور: <code dir="ltr" className="font-mono font-bold">v{updateInfo.currentVersion}</code> {updateInfo.releaseDate ? `| تاریخ انتشار: ${updateInfo.releaseDate}` : ''}
                  </p>
                </div>
              </div>
              <a
                href={updateInfo.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-2 shadow-xs shrink-0 self-start sm:self-center"
              >
                <Download className="w-4 h-4" />
                <span>مشاهده و دریافت از مخزن GitHub</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {updateInfo.changelog && updateInfo.changelog.length > 0 && (
              <div className="bg-white/80 dark:bg-[#1e2030] rounded-xl p-3 border border-emerald-200/60 dark:border-emerald-800/50">
                <span className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200 block mb-1.5">
                  لیست تغییرات و قابلیت‌های نگارش جدید (Changelog):
                </span>
                <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 list-disc list-inside">
                  {updateInfo.changelog.map((item, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* نوار وضعیت بررسی نسخه آنلاین / آفلاین */}
        <div className="flex flex-wrap items-center justify-between bg-slate-50 dark:bg-[#1e2030] border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-2.5 text-xs gap-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">وضعیت بررسی نسخه در مخزن:</span>
            {updateInfo?.status === 'Online' ? (
              updateInfo.hasUpdate ? (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/20 px-2.5 py-0.5 rounded-md">
                  <ArrowUpCircle className="w-3.5 h-3.5" />
                  نگارش جدید (<bdi dir="ltr">v{updateInfo.latestVersion}</bdi>) منتشر شده است
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  سامانه به آخرین نگارش به‌روز است (<bdi dir="ltr">v{updateInfo.currentVersion}</bdi>)
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300 bg-slate-200/60 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                شبکه ایزوله / استعلام آفلاین (بدون اینترنت)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => fetchUpdateInfo(true)}
            disabled={checkingUpdate}
            title="بررسی مجدد نسخه روی GitHub"
            aria-label="استعلام مجدد نسخه سامانه"
            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
            <span>{checkingUpdate ? 'در حال استعلام...' : 'استعلام مجدد'}</span>
          </button>
        </div>

        {/* پیام بازخورد */}
        {feedback && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center gap-2.5 transition ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
        )}

        {/* جعبه شناسه سخت‌افزاری سرور (Machine ID) */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1e2030] border border-slate-200 dark:border-slate-700/80 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              شناسه سخت‌افزاری یکتای سرور (Machine ID):
            </span>
            <span className="text-[11px] text-slate-400">
              جهت دریافت لایسنس، این شناسه را کپی کرده و برای پشتیبانی ارسال فرمایید
            </span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div dir="ltr" className="flex-1 font-mono text-base font-bold tracking-wider text-indigo-950 dark:text-indigo-200 bg-white dark:bg-[#252736] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-center sm:text-left select-all">
              {statusData?.machineId || 'در حال واکشی...'}
            </div>
            <button
              type="button"
              onClick={handleCopyMachineId}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>کپی شد!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>کپی شناسه</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* کارت‌های خلاصه وضعیت و متادیتای لایسنس */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* نام سازمان */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">سازمان بهره‌بردار</span>
              <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate" title={statusData?.organizationName}>
              {statusData?.organizationName || '—'}
            </div>
            <span className="text-[10px] text-slate-400 mt-1">
              {isTrial ? 'مجوز ارزیابی ۱۴ روزه' : 'مجوز حقوقی اختصاصی'}
            </span>
          </div>

          {/* سقف و تعداد کاربران */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">کاربران فعال / سقف مجاز</span>
              <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              <span className="text-indigo-600 dark:text-indigo-400">{statusData?.activeUsersCount ?? 0}</span> از{' '}
              <span>{statusData?.maxUsers ?? 0}</span> کاربر
            </div>
            {/* نوار پیشرفت */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  userUsagePercent >= 90 ? 'bg-rose-500' : userUsagePercent >= 70 ? 'bg-amber-500' : 'bg-indigo-600'
                }`}
                style={{ width: `${userUsagePercent}%` }}
              />
            </div>
          </div>

          {/* تاریخ انقضا و روزهای باقیمانده */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">مهلت اعتبار لایسنس</span>
              <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div dir="ltr" className="font-bold text-slate-800 dark:text-slate-100 text-sm font-mono text-right">
              {statusData?.expiresAtPersian || '—'}
            </div>
            <span
              className={`text-[10px] font-semibold mt-1 ${
                isExpired
                  ? 'text-rose-600 dark:text-rose-400'
                  : (statusData?.daysRemaining || 0) <= 7
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isExpired ? 'منقضی شده' : `${statusData?.daysRemaining ?? 0} روز دیگر`}
            </span>
          </div>

          {/* وضعیت ماژول هوش مصنوعی */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1e2030] flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-medium">ماژول هوش مصنوعی (AI)</span>
              <Sparkles className="w-4 h-4 text-blue-500" />
            </div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-1.5">
              {statusData?.enableAiModule ? (
                <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  فعال و مجاز
                </span>
              ) : (
                <span className="text-slate-400 flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                  غیرفعال
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1">کوئری‌ساز چندفرمی T-SQL</span>
          </div>
        </div>

        {/* فرم ثبت یا ارتقای کلید لایسنس */}
        <form onSubmit={handleActivate} className="p-5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1e2030] space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            ثبت یا تمدید کلید لایسنس (License Key):
          </label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            کلید امضاشده دریافتی از تیم پشتیبانی را در کادر زیر قرار داده و روی دکمه «فعال‌سازی لایسنس» کلیک کنید.
          </p>
          <textarea
            rows={3}
            dir="ltr"
            value={licenseInput}
            onChange={(e) => setLicenseInput(e.target.value)}
            placeholder="کد کلید لایسنس را اینجا جای‌گذاری کنید (Paste)..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-mono text-left bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isActive && !isTrial && (
              <button
                type="button"
                onClick={handleRemoveLicense}
                disabled={removing || loading}
                className="bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{removing ? 'در حال حذف لایسنس...' : 'حذف لایسنس و بازگشت به حالت ارزیابی (Trial)'}</span>
              </button>
            )}
            <div className="w-full sm:w-auto sm:mr-auto">
              <button
                type="submit"
                disabled={activating || !licenseInput.trim()}
                className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {activating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال اعتبارسنجی و فعال‌سازی...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>فعال‌سازی لایسنس</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* باکس اطلاعات تماس، پشتیبانی و QR Code واتساپ (کاملاً آفلاین) */}
        {!hideDevContact && (
          <div className="p-5 rounded-2xl border border-indigo-100 dark:border-slate-700/80 bg-gradient-to-br from-indigo-50/70 via-slate-50/60 to-blue-50/50 dark:from-[#232536] dark:via-[#232536] dark:to-[#232536] dark:bg-[#232536] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100/80 dark:border-slate-700/80 pb-3">
              <div className="flex items-center gap-2 text-indigo-950 dark:text-indigo-300 font-bold text-xs">
                <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>اطلاعات تماس توسعه‌دهنده جهت دریافت یا تمدید کلید لایسنس</span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-400 font-mono">
                v{statusData?.version || '1.0.0'}
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              برای خرید لایسنس رسمی دائم، تمدید دوره پشتیبانی، افزایش سقف مجاز کاربران فعال یا فعال‌سازی ماژول هوش مصنوعی، شناسه
              سخت‌افزاری (<code className="font-mono bg-white dark:bg-[#1b1c29] px-1.5 py-0.5 rounded border border-indigo-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 font-bold">Machine ID</code>)
              را کپی کرده و از طریق یکی از راه‌های ارتباطی زیر یا اسکن مستقیم بارکد واتساپ برای توسعه‌دهنده ارسال فرمایید:
            </p>

            <div className="flex flex-col md:flex-row items-center gap-5 pt-1">
              {/* کارت QR Code آفلاین واتساپ */}
              <div className="flex flex-col items-center bg-white dark:bg-[#1b1c29] p-3.5 rounded-2xl border border-indigo-100 dark:border-slate-700 shadow-md shrink-0 text-center">
                <div className="bg-white p-1 rounded-xl">
                  <QRCodeSVG
                    value={statusData?.vendorInfo?.whatsappUrl || 'https://wa.me/qr/X7NJ6BHTONWWF1'}
                    size={120}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-[11px]">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>اسکن با واتساپ</span>
                </div>
                <a
                  href={statusData?.vendorInfo?.whatsappUrl || 'https://wa.me/qr/X7NJ6BHTONWWF1'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 underline font-mono flex items-center gap-1"
                >
                  <span>ارتباط مستقیم در وب</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              {/* کارت‌های مشخصات تماس و مخزن */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {/* نام توسعه‌دهنده */}
                <div className="flex items-center gap-2.5 bg-white dark:bg-[#1b1c29] p-3 rounded-xl border border-indigo-100 dark:border-slate-700/80 shadow-2xs">
                  <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block">مالک و توسعه‌دهنده سامانه</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {statusData?.vendorInfo?.companyName || 'Shahab Nazemi'}
                    </span>
                  </div>
                </div>

                {/* ایمیل پشتیبانی */}
                <div className="flex items-center gap-2.5 bg-white dark:bg-[#1b1c29] p-3 rounded-xl border border-indigo-100 dark:border-slate-700/80 shadow-2xs">
                  <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block">ایمیل پشتیبانی مستقیم</span>
                    <a
                      href={`mailto:${statusData?.vendorInfo?.email || 'shahab.nazemi@gmail.com'}`}
                      dir="ltr"
                      className="text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:underline font-mono truncate block"
                    >
                      {statusData?.vendorInfo?.email || 'shahab.nazemi@gmail.com'}
                    </a>
                  </div>
                </div>

                {/* لینک واتساپ */}
                <div className="flex items-center gap-2.5 bg-white dark:bg-[#1b1c29] p-3 rounded-xl border border-indigo-100 dark:border-slate-700/80 shadow-2xs">
                  <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block">پشتیبانی و تمدید در واتساپ</span>
                    <a
                      href={statusData?.vendorInfo?.whatsappUrl || 'https://wa.me/qr/X7NJ6BHTONWWF1'}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline font-mono truncate block flex items-center gap-1"
                    >
                      <span>wa.me/qr/X7NJ...</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                {/* آدرس مخزن گیت‌هاب */}
                <div className="flex items-center gap-2.5 bg-white dark:bg-[#1b1c29] p-3 rounded-xl border border-indigo-100 dark:border-slate-700/80 shadow-2xs">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-400 block">مخزن رسمی سورس پروژه (GitHub)</span>
                    <a
                      href={statusData?.vendorInfo?.repositoryUrl || statusData?.vendorInfo?.website || 'https://github.com/NazemiSh/BPMS-BRMS-Platform'}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:underline font-mono truncate block flex items-center gap-1"
                    >
                      <span>BPMS-BRMS-Platform</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
