import React, { useState } from 'react';
import api from '../api';
import { QRCodeSVG } from 'qrcode.react';
import {
  Lock,
  Key,
  ShieldAlert,
  Copy,
  Check,
  Building2,
  Phone,
  Mail,
  Globe,
  RefreshCw,
  Cpu,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  MessageCircle,
  ExternalLink
} from 'lucide-react';

export default function LicenseLockScreen({ licenseData, onActivated, onLogout }) {
  const hideDevContact = import.meta.env.VITE_HIDE_DEV_CONTACT === 'true';
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const machineId = licenseData?.machineId || '';
  const vendorInfo = hideDevContact ? {} : (licenseData?.vendorInfo || {
    companyName: 'Shahab Nazemi',
    phone: '0900-000-0000',
    email: 'shahab.nazemi@gmail.com',
    website: 'https://github.com/NazemiSh/NovaFlow-BPMS',
    whatsappUrl: 'https://wa.me/qr/X7NJ6BHTONWWF1',
    repositoryUrl: 'https://github.com/NazemiSh/NovaFlow-BPMS'
  });
  const isTrial = licenseData?.isTrial ?? false;
  const isClockTampered = licenseData?.status === 'ClockTampered';
  const whatsappUrl = hideDevContact ? '' : (vendorInfo.whatsappUrl || 'https://wa.me/qr/X7NJ6BHTONWWF1');
  const repoUrl = hideDevContact ? '' : (vendorInfo.repositoryUrl || vendorInfo.website || 'https://github.com/NazemiSh/NovaFlow-BPMS');

  const handleCopy = async () => {
    if (!machineId) return;
    try {
      await navigator.clipboard.writeText(machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.createElement('textarea');
      el.value = machineId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleActivateNewKey = async (e) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) {
      setFeedback({ type: 'error', text: 'لطفاً کلید لایسنس جدید را وارد نمایید.' });
      return;
    }

    try {
      setActivating(true);
      setFeedback(null);
      const res = await api.post('/license/activate-expired', {
        licenseKey: licenseKeyInput.trim()
      });

      setFeedback({
        type: 'success',
        text: res.data.message || 'لایسنس با موفقیت فعال شد. در حال بارگذاری مجدد سامانه...'
      });

      setTimeout(() => {
        if (onActivated) {
          onActivated(res.data.status);
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'فعال‌سازی لایسنس ناموفق بود: ' + (err.response?.data?.message || err.message)
      });
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-2xl w-full bg-slate-900/90 border border-slate-700/80 rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-md space-y-6 my-auto">
        {/* هدر صفحه قفل */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-right">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-rose-950/50">
            <Lock className="w-8 h-8 text-rose-400" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-black tracking-tight text-white">
                {isClockTampered 
                  ? 'سامانه تعلیق شده است: دستکاری در تاریخ یا ساعت سرور'
                  : 'سامانه قفل شده است: انقضای اعتبار لایسنس'}
              </h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                {isClockTampered
                  ? 'تعلیق امنیتی (Anti-Tamper)'
                  : isTrial ? 'پایان دوره ارزیابی' : 'انقضای لایسنس رسمی'}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isClockTampered
                ? 'ساعت سیستم سرور به عقب کشیده شده است یا دستکاری در تاریخ تشخیص داده شد. سامانه به منظور حفظ الزامات لایسنس به حالت تعلیق درآمد. جهت رفع تعلیق، ساعت و تاریخ سرور را به زمان واقعی تنظیم فرمایید یا کلید لایسنس جدید ثبت نمایید.'
                : isTrial
                ? 'مهلت ۱۴ روزه دوره ارزیابی رایگان (Trial) سامانه مدیریت فرآیندهای کسب‌وکار (BPMS) به پایان رسیده است. جهت ادامه فعالیت، ثبت اطلاعات و ورود به سامانه، لطفاً کلید لایسنس معتبر را ثبت نمایید.'
                : 'تاریخ اعتبار لایسنس رسمی سامانه به پایان رسیده است. جهت ادامه کار و تمدید دسترسی کاربران، لطفاً کلید لایسنس تمدیدشده را در کادر زیر وارد و فعال فرمایید.'}
            </p>
          </div>
        </div>

        {/* بازخورد خطا / موفقیت */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl text-xs flex items-center gap-3 transition ${
              feedback.type === 'success'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                : 'bg-rose-500/20 border border-rose-500/40 text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">{feedback.text}</span>
          </div>
        )}

        {/* کادر شناسه سخت‌افزاری سرور (Machine ID) */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>شناسه سخت‌افزاری پایدار سرور (Machine ID):</span>
            </span>
            <span className="text-[11px] text-slate-400">یکتا برای این ماشین</span>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 font-mono text-base font-bold tracking-wider text-indigo-300 bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center sm:text-left select-all">
              {machineId || 'در حال واکشی...'}
            </div>
            <button
              type="button"
              onClick={handleCopy}
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
          <p className="text-[11px] text-slate-400 pt-1">
            جهت صدور یا تمدید کلید لایسنس، شناسه سخت‌افزاری فوق را کپی کرده و در اختیار پشتیبانی قرار دهید.
          </p>
        </div>

        {/* فرم ثبت کلید لایسنس جدید */}
        <form onSubmit={handleActivateNewKey} className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
          <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Key className="w-4 h-4 text-amber-400" />
            <span>ثبت و فعال‌سازی کلید لایسنس جدید (License Key):</span>
          </label>
          <textarea
            rows={3}
            dir="ltr"
            value={licenseKeyInput}
            onChange={(e) => setLicenseKeyInput(e.target.value)}
            placeholder="کلید لایسنس دریافتی از پشتیبانی را اینجا Paste کنید..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 text-xs font-mono bg-slate-950 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>بازگشت به صفحه ورود</span>
              </button>
            )}
            <div className="mr-auto">
              <button
                type="submit"
                disabled={activating || !licenseKeyInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-lg shadow-indigo-950/50 flex items-center gap-2 cursor-pointer"
              >
                {activating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>در حال اعتبارسنجی و بازگشایی سامانه...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>فعال‌سازی لایسنس و بازگشایی سامانه</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* اطلاعات تماس پشتیبانی و QR Code واتساپ (کاملاً آفلاین) */}
        {!hideDevContact && (
          <div className="border border-slate-800 bg-slate-950/70 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>اطلاعات تماس توسعه‌دهنده جهت دریافت و تمدید فوری لایسنس:</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                v{licenseData?.version || '1.0.0'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-5">
              {/* کارت کیوآرکد واتساپ کاملاً آفلاین */}
              <div className="flex flex-col items-center bg-white p-3 rounded-2xl border border-slate-300 shadow-lg shrink-0 text-center">
                <div className="bg-white p-1 rounded-xl">
                  <QRCodeSVG
                    value={whatsappUrl}
                    size={120}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-emerald-700 font-bold text-[11px]">
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>اسکن با واتساپ</span>
                </div>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 text-[10px] text-slate-500 hover:text-emerald-700 underline font-mono flex items-center gap-1"
                >
                  <span>ارتباط مستقیم در وب</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>

              {/* کارت‌های مشخصات تماس و مخزن */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                <div className="flex items-center gap-2.5 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-500 block">مالک و توسعه‌دهنده</span>
                    <span className="text-xs font-bold text-slate-200">{vendorInfo.companyName || 'Shahab Nazemi'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-500 block">ایمیل پشتیبانی</span>
                    <a
                      href={`mailto:${vendorInfo.email || 'shahab.nazemi@gmail.com'}`}
                      dir="ltr"
                      className="text-xs font-bold text-indigo-300 hover:underline font-mono truncate block"
                    >
                      {vendorInfo.email || 'shahab.nazemi@gmail.com'}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-500 block">پشتیبانی واتساپ</span>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="text-xs font-bold text-emerald-400 hover:underline font-mono truncate block flex items-center gap-1"
                    >
                      <span>wa.me/qr/X7NJ...</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                  <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-[10px] text-slate-500 block">مخزن گیت‌هاب</span>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                      className="text-xs font-bold text-slate-300 hover:text-white font-mono truncate block flex items-center gap-1"
                    >
                      <span>NovaFlow-BPMS</span>
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
