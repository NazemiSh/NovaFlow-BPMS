import React, { useState, useEffect } from 'react';
import api from '../api';
import { Mail, Settings, Layers, Clock, ShieldCheck, Lock, Info } from 'lucide-react';
import LicensePanel from './LicensePanel';
import { useDialog } from './GlobalDialogProvider';

const DEFAULT_SECURITY_POLICY = {
  enablePasswordPolicy: false,
  minPasswordLength: 6,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecialChar: false,
  enableAccountLockout: true,
  maxFailedLoginAttempts: 5,
  lockoutDurationMinutes: 15
};

export default function SystemSettingsTab({
  user = {},
  emailSettings = {},
  setEmailSettings,
  adSettings = {},
  setAdSettings,
  branding = {},
  setBranding,
  logoPreview = null,
  setLogoPreview,
  sessionTimeoutMinutes = 0,
  setSessionTimeoutMinutes,
  securityPolicy = DEFAULT_SECURITY_POLICY,
  setSecurityPolicy,
  setToken
}) {
  const { toast } = useDialog();
  const [localSecurityPolicy, setLocalSecurityPolicy] = useState({
    ...DEFAULT_SECURITY_POLICY,
    ...(securityPolicy || {})
  });
  const [securitySaving, setSecuritySaving] = useState(false);

  useEffect(() => {
    if (securityPolicy) {
      setLocalSecurityPolicy({ ...DEFAULT_SECURITY_POLICY, ...securityPolicy });
    }
  }, [securityPolicy]);

  useEffect(() => {
    api.get('/settings/security-policy')
      .then((res) => {
        if (res?.data) {
          const merged = { ...DEFAULT_SECURITY_POLICY, ...res.data };
          setLocalSecurityPolicy(merged);
          if (setSecurityPolicy) setSecurityPolicy(merged);
        }
      })
      .catch(() => {});
  }, []);

  const updatePolicyField = (field, value) => {
    setLocalSecurityPolicy((prev) => ({ ...prev, [field]: value }));
  };
  // تست ارسال ایمیل و لاگ زنده
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [emailTestLogs, setEmailTestLogs] = useState([]);
  const [emailTestSuccess, setEmailTestSuccess] = useState(null);

  // تست اتصال اکتیو دایرکتوری و لاگ زنده
  const [adTestLoading, setAdTestLoading] = useState(false);
  const [adTestLogs, setAdTestLogs] = useState([]);
  const [adTestSuccess, setAdTestSuccess] = useState(null);

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* هدر استاندارد تنظیمات سامانه */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700/80">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-blue-700 flex items-center justify-center shadow-lg text-white shrink-0">
          <Settings className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
            تنظیمات سامانه، برندینگ و اعلان‌ها
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            پیکربندی اکتیو دایرکتوری، هویت بصری سازمان و سرویس ارسال ایمیل نوتیفیکیشن کارتابل
          </p>
        </div>
      </div>

      {/* بخش سرویس ایمیل */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 bg-slate-50 dark:bg-[#1e2030] space-y-4">
        <h4 className="font-bold text-md text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>سرویس اعلان ایمیلی کارتابل (SMTP Notification Gateway)</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">آدرس سرور SMTP (IP / Hostname)</label>
            <input
              type="text"
              dir="ltr"
              value={emailSettings.smtpHost || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtpHost: e.target.value })}
              placeholder="192.168.1.25"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">پورت SMTP</label>
            <input
              type="number"
              dir="ltr"
              value={emailSettings.smtpPort || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtpPort: parseInt(e.target.value, 10) || 25 })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">آدرس ایمیل پیش‌فرض فرستنده (From Email)</label>
            <input
              type="email"
              dir="ltr"
              value={emailSettings.fromEmail || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, fromEmail: e.target.value })}
              placeholder="bpms@company.local"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام نمایشی فرستنده (Display Name)</label>
            <input
              type="text"
              value={emailSettings.fromName || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, fromName: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام کاربری احراز هویت SMTP</label>
            <input
              type="text"
              dir="ltr"
              value={emailSettings.smtpUser || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtpUser: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">کلمه عبور احراز هویت SMTP</label>
            <input
              type="password"
              dir="ltr"
              value={emailSettings.smtpPassword || ''}
              onChange={(e) => setEmailSettings({ ...emailSettings, smtpPassword: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-6 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(emailSettings.enableSsl)}
              onChange={(e) => setEmailSettings({ ...emailSettings, enableSsl: e.target.checked })}
              className="rounded text-indigo-600"
            />
            <span>فعال‌سازی رمزنگاری امن SSL / TLS</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(emailSettings.sendOnInboxTask)}
              onChange={(e) => setEmailSettings({ ...emailSettings, sendOnInboxTask: e.target.checked })}
              className="rounded text-indigo-600"
            />
            <span>ارسال ایمیل خودکار به کارتابل ورودی کاربران هنگام ارجاع فرم</span>
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">قالب موضوع ایمیل اطلاع‌رسانی</label>
          <input
            type="text"
            value={emailSettings.defaultSubject || ''}
            onChange={(e) => setEmailSettings({ ...emailSettings, defaultSubject: e.target.value })}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">قالب متن پیام ایمیل (با پشتیبانی از برچسب‌های داینامیک)</label>
          <textarea
            rows={6}
            value={emailSettings.defaultBody || ''}
            onChange={(e) => setEmailSettings({ ...emailSettings, defaultBody: e.target.value })}
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px] leading-relaxed"
          />
          <span className="text-[10px] text-slate-400 mt-1 block font-mono">
            متغیرهای قابل استفاده: <bdi dir="ltr">{'{TrackingCode}'}</bdi>، <bdi dir="ltr">{'{FormTitle}'}</bdi>، <bdi dir="ltr">{'{SenderName}'}</bdi>، <bdi dir="ltr">{'{PortalLink}'}</bdi>
          </span>
        </div>

        <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">آدرس ایمیل گیرنده جهت ارسال تست:</label>
              <input
                type="email"
                dir="ltr"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder={user.email || 'example@company.local'}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-left bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              disabled={emailTestLoading}
              onClick={async () => {
                const recipient = (testEmailRecipient || user.email || '').trim();
                if (!recipient) {
                  toast.warning('لطفاً آدرس ایمیل گیرنده تست را وارد کنید.');
                  return;
                }
                setEmailTestLoading(true);
                setEmailTestSuccess(null);
                setEmailTestLogs(['در حال ارسال درخواست تست به سرور...']);
                try {
                  const res = await api.post('/settings/email/test', {
                    ...emailSettings,
                    toEmail: recipient
                  });
                  setEmailTestSuccess(res.data.success);
                  setEmailTestLogs(res.data.logs || [res.data.message]);
                } catch (err) {
                  setEmailTestSuccess(false);
                  setEmailTestLogs([
                    'خطا در ارتباط با API سامانه:',
                    err.response?.data?.message || err.message
                  ]);
                } finally {
                  setEmailTestLoading(false);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-sm shrink-0"
            >
              {emailTestLoading ? 'در حال ارسال تست...' : 'ارسال ایمیل تستی'}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await api.post('/settings/email', emailSettings);
                  toast.success('تنظیمات سرویس ایمیل با موفقیت ذخیره شد.');
                } catch (err) {
                  toast.error('خطا در ذخیره تنظیمات ایمیل: ' + (err.response?.data?.message || err.message));
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-sm shrink-0"
            >
              ذخیره تنظیمات ایمیل
            </button>
          </div>

          {emailTestLogs.length > 0 && (
            <div className={`rounded-xl p-4 border text-xs font-mono space-y-1.5 ${
              emailTestSuccess === true
                ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
                : emailTestSuccess === false
                ? 'bg-rose-950 text-rose-200 border-rose-700'
                : 'bg-slate-900 text-slate-200 border-slate-700'
            }`}>
              <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/10 font-sans font-bold">
                <span>
                  {emailTestSuccess === true
                    ? '✅ گزارش تست SMTP (موفق)'
                    : emailTestSuccess === false
                    ? '❌ گزارش خطای تست SMTP'
                    : '⏳ در حال بررسی...'}
                </span>
                <button
                  type="button"
                  onClick={() => setEmailTestLogs([])}
                  className="text-[11px] opacity-70 hover:opacity-100"
                >
                  پاک کردن لاگ
                </button>
              </div>
              <div className="space-y-1 max-h-44 overflow-y-auto leading-relaxed">
                {emailTestLogs.map((line, i) => (
                  <div key={i} className="break-words">{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* بخش Active Directory */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 bg-slate-50 dark:bg-[#1e2030]">
        <h4 className="font-bold text-md text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          تنظیمات Active Directory
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام دامنه (Domain Name)</label>
            <input
              type="text"
              dir="ltr"
              value={adSettings.domainName || ''}
              onChange={(e) => setAdSettings({ ...adSettings, domainName: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">سرور LDAP (IP/Hostname)</label>
            <input
              type="text"
              dir="ltr"
              value={adSettings.ldapServer || ''}
              onChange={(e) => setAdSettings({ ...adSettings, ldapServer: e.target.value })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">پورت LDAP</label>
            <input
              type="number"
              dir="ltr"
              value={adSettings.ldapPort || ''}
              onChange={(e) => setAdSettings({ ...adSettings, ldapPort: parseInt(e.target.value, 10) || 389 })}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">حساب خدماتی (Service User)</label>
            <input
              type="text"
              dir="ltr"
              value={adSettings.serviceUser || ''}
              onChange={(e) => setAdSettings({ ...adSettings, serviceUser: e.target.value })}
              placeholder="username@company.local"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">کلمه عبور حساب خدماتی (جهت تست Bind و همگام‌سازی گروه‌ها)</label>
            <input
              type="password"
              dir="ltr"
              value={adSettings.servicePassword || ''}
              onChange={(e) => setAdSettings({ ...adSettings, servicePassword: e.target.value })}
              placeholder="کلمه عبور اکانت دامین..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(adSettings.isEnabled)}
              onChange={(e) => setAdSettings({ ...adSettings, isEnabled: e.target.checked })}
              className="rounded text-indigo-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">فعال‌سازی احراز هویت Active Directory</span>
          </label>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={async () => {
              try {
                await api.post('/settings/ad', adSettings);
                toast.success('تنظیمات Active Directory با موفقیت ذخیره شد.');
              } catch (err) {
                toast.error(err.response?.data?.message || 'خطا در ذخیره تنظیمات.');
              }
            }}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition shadow-sm text-xs cursor-pointer"
          >
            ذخیره تنظیمات
          </button>
          <button
            type="button"
            disabled={adTestLoading}
            onClick={async () => {
              setAdTestLoading(true);
              setAdTestSuccess(null);
              setAdTestLogs(['در حال ارسال درخواست تست اتصال به سرور Active Directory...']);
              try {
                const res = await api.post('/settings/ad/test', adSettings);
                setAdTestSuccess(res.data.success);
                setAdTestLogs(res.data.logs || [res.data.message]);
              } catch (err) {
                setAdTestSuccess(false);
                setAdTestLogs([
                  'خطا در ارتباط با API سامانه:',
                  err.response?.data?.message || err.message
                ]);
              } finally {
                setAdTestLoading(false);
              }
            }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition shadow-sm text-xs cursor-pointer"
          >
            {adTestLoading ? 'در حال تست اتصال دامین...' : 'تست اتصال'}
          </button>
        </div>

        {adTestLogs.length > 0 && (
          <div className={`mt-4 rounded-xl p-4 border text-xs font-mono space-y-1.5 ${
            adTestSuccess === true
              ? 'bg-emerald-950 text-emerald-200 border-emerald-700'
              : adTestSuccess === false
              ? 'bg-rose-950 text-rose-200 border-rose-700'
              : 'bg-slate-900 text-slate-200 border-slate-700'
          }`}>
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/10 font-sans font-bold">
              <span>
                {adTestSuccess === true
                  ? '✅ گزارش تست اتصال Active Directory (موفق)'
                  : adTestSuccess === false
                  ? '❌ گزارش خطای اتصال Active Directory'
                  : '⏳ در حال بررسی...'}
              </span>
              <button
                type="button"
                onClick={() => setAdTestLogs([])}
                className="text-[11px] opacity-70 hover:opacity-100"
              >
                پاک کردن لاگ
              </button>
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto leading-relaxed">
              {adTestLogs.map((line, i) => (
                <div key={i} className="break-words">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* بخش برندینگ و لوگو */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 bg-slate-50 dark:bg-[#1e2030]">
        <h4 className="font-bold text-md text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          برندینگ شرکت (لوگو)
        </h4>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          <div className="flex-shrink-0 w-36 h-36 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center bg-white dark:bg-[#252736] p-2">
            {logoPreview ? (
              <img src={logoPreview} alt="Preview" className="w-full h-full object-contain rounded-xl" />
            ) : branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-xl" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <div className="text-center text-slate-300 dark:text-slate-600">
                <Layers className="w-8 h-8 mx-auto mb-1" />
                <span className="text-[10px]">بدون لوگو</span>
              </div>
            )}
          </div>

          <div className="w-full min-w-0 flex-1 space-y-3">
            <label
              htmlFor="logo-upload-input"
              className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer bg-white dark:bg-[#252736] hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
            >
              <Layers className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">برای انتخاب تصویر لوگو کلیک کنید</span>
              <span className="text-[10px] text-slate-400">PNG, JPG یا JPEG (حداکثر <bdi dir="ltr">2MB</bdi>)</span>
              <input
                id="logo-upload-input"
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 2 * 1024 * 1024) {
                      toast.warning('حجم فایل نباید بیش از ۲ مگابایت باشد.');
                      return;
                    }
                    setLogoPreview(URL.createObjectURL(file));
                    const formData = new FormData();
                    formData.append('file', file);
                    try {
                      const res = await api.post('/settings/upload-logo', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                      });
                      setBranding(prev => ({ ...prev, logoUrl: res.data.logoUrl, version: res.data.version || prev.version }));
                      setLogoPreview(null);
                      toast.success('لوگو با موفقیت بارگذاری شد.');
                    } catch (err) {
                      toast.error('خطا در بارگذاری لوگو: ' + err.message);
                    }
                  }
                }}
              />
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">عنوان سامانه در هدر و PWA</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={branding.systemTitle || ''}
                  onChange={(e) => setBranding({ ...branding, systemTitle: e.target.value })}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.post('/settings/branding', { systemTitle: branding.systemTitle });
                      setBranding(prev => ({
                        ...prev,
                        systemTitle: res.data.systemTitle,
                        logoUrl: res.data.logoUrl || prev.logoUrl,
                        version: res.data.version || prev.version
                      }));
                      toast.success(res.data?.message || 'نام سامانه با موفقیت ذخیره شد.');
                    } catch (err) {
                      toast.error('خطا در ذخیره نام سامانه: ' + (err.response?.data?.message || err.message));
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
                >
                  ذخیره نام سامانه
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* بخش تنظیمات نشست کاربری (Session Timeout) */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 bg-slate-50 dark:bg-[#1e2030] space-y-4">
        <h4 className="font-bold text-md text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>مدیریت نشست کاربری و خروج خودکار (Session Timeout)</span>
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          تعیین مدت زمان مجاز عدم فعالیت کاربران پیش از خروج خودکار از سامانه. در حالت «بدون خروج خودکار»، نشست کاربری به صورت خودکار تمدید شده و کاربر از پنل خارج نمی‌شود.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <select
            value={sessionTimeoutMinutes}
            onChange={(e) => setSessionTimeoutMinutes(parseInt(e.target.value, 10))}
            className="w-full sm:flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={0}>بدون خروج خودکار (نامحدود / Always Stay Logged In)</option>
            <option value={15}>۱۵ دقیقه عدم فعالیت</option>
            <option value={30}>۳۰ دقیقه عدم فعالیت</option>
            <option value={60}>۱ ساعت (۶۰ دقیقه) عدم فعالیت</option>
            <option value={240}>۴ ساعت (۲۴۰ دقیقه) عدم فعالیت</option>
            <option value={480}>۸ ساعت (یک شیفت کاری - ۴۸۰ دقیقه)</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.post('/settings/session', { sessionTimeoutMinutes });
                localStorage.setItem('bpms_session_timeout', String(sessionTimeoutMinutes));
                const refreshRes = await api.post('/auth/refresh');
                if (refreshRes.data?.token) {
                  localStorage.setItem('bpms_token', refreshRes.data.token);
                  setToken(refreshRes.data.token);
                }
                toast.success('تنظیمات نشست کاربری ذخیره و اعمال شد.');
              } catch (err) {
                toast.error('خطا در ذخیره تنظیمات نشست: ' + (err.response?.data?.message || err.message));
              }
            }}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-sm shrink-0 cursor-pointer"
          >
            ذخیره تنظیمات نشست
          </button>
        </div>
      </div>

      {/* بخش سیاست گذرواژه و امنیت حساب‌های محلی */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl p-5 bg-slate-50 dark:bg-[#1e2030] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="font-bold text-md text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>سیاست گذرواژه و امنیت حساب‌های محلی (Password &amp; Lockout Policy)</span>
          </h4>
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-2.5 leading-relaxed">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <span>
            تنظیمات این بخش <b>منحصراً برای حساب‌های محلی (Local Accounts)</b> اعمال می‌شود و شامل کاربران <b>Active Directory</b> نمی‌گردد؛ سیاست گذرواژه و قفل شدن حساب‌های دامین توسط سرور Active Directory کنترل می‌شود.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* زیربخش پیچیدگی رمز عبور */}
          <div className="bg-white dark:bg-[#252736] border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/70">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                  الزامات پیچیدگی گذرواژه
                </span>
                <span className="text-[11px] text-slate-400">
                  اعمال هنگام ایجاد کاربر محلی یا تغییر رمز عبور
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(localSecurityPolicy.enablePasswordPolicy)}
                  onChange={(e) => updatePolicyField('enablePasswordPolicy', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className={`space-y-3 transition-opacity ${localSecurityPolicy.enablePasswordPolicy ? 'opacity-100' : 'opacity-55'}`}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  حداقل طول رمز عبور (۶ تا ۳۲ کاراکتر)
                </label>
                <input
                  type="number"
                  min={6}
                  max={32}
                  dir="ltr"
                  disabled={!localSecurityPolicy.enablePasswordPolicy}
                  value={localSecurityPolicy.minPasswordLength}
                  onChange={(e) => updatePolicyField('minPasswordLength', parseInt(e.target.value, 10) || 6)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left bg-slate-50 dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!localSecurityPolicy.enablePasswordPolicy}
                    checked={Boolean(localSecurityPolicy.requireUppercase)}
                    onChange={(e) => updatePolicyField('requireUppercase', e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>الزام حروف بزرگ (<bdi dir="ltr" className="font-mono">A-Z</bdi>)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!localSecurityPolicy.enablePasswordPolicy}
                    checked={Boolean(localSecurityPolicy.requireLowercase)}
                    onChange={(e) => updatePolicyField('requireLowercase', e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>الزام حروف کوچک (<bdi dir="ltr" className="font-mono">a-z</bdi>)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!localSecurityPolicy.enablePasswordPolicy}
                    checked={Boolean(localSecurityPolicy.requireDigit)}
                    onChange={(e) => updatePolicyField('requireDigit', e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>الزام وجود اعداد (<bdi dir="ltr" className="font-mono">0-9</bdi>)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    disabled={!localSecurityPolicy.enablePasswordPolicy}
                    checked={Boolean(localSecurityPolicy.requireSpecialChar)}
                    onChange={(e) => updatePolicyField('requireSpecialChar', e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>کاراکتر ویژه (<bdi dir="ltr" className="font-mono">!@#$%^&amp;*</bdi>)</span>
                </label>
              </div>
            </div>
          </div>

          {/* زیربخش قفل شدن خودکار حساب */}
          <div className="bg-white dark:bg-[#252736] border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/70">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                  <span>قفل خودکار حساب (Brute-Force Protection)</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  مسدودسازی موقت حساب محلی پس از ورودهای ناموفق پیاپی
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(localSecurityPolicy.enableAccountLockout)}
                  onChange={(e) => updatePolicyField('enableAccountLockout', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            <div className={`space-y-3 transition-opacity ${localSecurityPolicy.enableAccountLockout ? 'opacity-100' : 'opacity-55'}`}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  حداکثر تلاش ناموفق مجاز پیش از قفل شدن
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  dir="ltr"
                  disabled={!localSecurityPolicy.enableAccountLockout}
                  value={localSecurityPolicy.maxFailedLoginAttempts}
                  onChange={(e) => updatePolicyField('maxFailedLoginAttempts', parseInt(e.target.value, 10) || 5)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left bg-slate-50 dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  مدت زمان قفل ماندن حساب (دقیقه)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  dir="ltr"
                  disabled={!localSecurityPolicy.enableAccountLockout}
                  value={localSecurityPolicy.lockoutDurationMinutes}
                  onChange={(e) => updatePolicyField('lockoutDurationMinutes', parseInt(e.target.value, 10) || 15)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-mono text-left bg-slate-50 dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={securitySaving}
            onClick={async () => {
              const minLen = Number(localSecurityPolicy.minPasswordLength);
              const maxAttempts = Number(localSecurityPolicy.maxFailedLoginAttempts);
              const lockMins = Number(localSecurityPolicy.lockoutDurationMinutes);

              if (!Number.isInteger(minLen) || minLen < 6 || minLen > 32) {
                toast.warning('حداقل طول رمز عبور باید عددی بین ۶ تا ۳۲ کاراکتر باشد.');
                return;
              }
              if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 50) {
                toast.warning('تعداد تلاش ناموفق مجاز باید بین ۱ تا ۵۰ بار باشد.');
                return;
              }
              if (!Number.isInteger(lockMins) || lockMins < 1 || lockMins > 1440) {
                toast.warning('مدت قفل ماندن حساب باید بین ۱ تا ۱۴۴۰ دقیقه باشد.');
                return;
              }

              try {
                setSecuritySaving(true);
                const payload = {
                  ...localSecurityPolicy,
                  minPasswordLength: minLen,
                  maxFailedLoginAttempts: maxAttempts,
                  lockoutDurationMinutes: lockMins
                };
                const res = await api.post('/settings/security-policy', payload);
                const savedPolicy = res.data?.policy || payload;
                setLocalSecurityPolicy(savedPolicy);
                if (setSecurityPolicy) setSecurityPolicy(savedPolicy);
                toast.success(res.data?.message || 'سیاست گذرواژه و امنیت حساب‌های محلی ذخیره شد.');
              } catch (err) {
                toast.error('خطا در ذخیره سیاست امنیتی: ' + (err.response?.data?.message || err.message));
              } finally {
                setSecuritySaving(false);
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-sm cursor-pointer"
          >
            {securitySaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سیاست‌های امنیتی'}
          </button>
        </div>
      </div>

      {/* بخش مدیریت لایسنس سخت‌افزاری و اطلاعات پشتیبانی */}
      <LicensePanel />
    </div>
  );
}
