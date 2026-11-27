import React, { useState, useEffect } from 'react';
import { Layers, Moon, Sun, Monitor, XCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import api from '../api';
import { isSafeInternalPath } from '../utils/security';

export default function LoginPage({
  token,
  setToken,
  setUser,
  lastActivityRef,
  setActiveTab,
  theme,
  cycleTheme
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    document.title = 'نوافلو (NovaFlow) | سامانه مدیریت فرآیندهای سازمانی';
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrlParam = urlParams.get('returnUrl');
        if (returnUrlParam && isSafeInternalPath(returnUrlParam)) {
          sessionStorage.setItem('bpms_post_login_redirect', returnUrlParam);
        }
      } catch (e) {
        console.warn('Error parsing returnUrl param:', e);
      }
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');

    try {
      const res = await api.post('/auth/login', { username, password });
      const data = res.data;
      localStorage.setItem('bpms_token', data.token);
      localStorage.setItem('bpms_user', JSON.stringify(data));
      setToken(data.token);
      setUser(data);
      if (lastActivityRef) {
        lastActivityRef.current = Date.now();
      }

      // هدایت خودکار به مسیر ذخیره‌شده (دیپ‌لینک پیوست‌ها یا مسیرهای مستقیم) بلافاصله پس از ورود
      const redirectUrl = sessionStorage.getItem('bpms_post_login_redirect');
      if (redirectUrl && isSafeInternalPath(redirectUrl)) {
        sessionStorage.removeItem('bpms_post_login_redirect');
        window.location.href = redirectUrl;
        return;
      }

      if (setActiveTab) {
        setActiveTab('inbox');
      }
    } catch (err) {
      console.error('Login error:', err);
      const serverMsg =
        err.response?.data?.message ||
        err.response?.data?.title ||
        (typeof err.response?.data === 'string' ? err.response?.data : null) ||
        err.message ||
        'نام کاربری یا کلمه عبور اشتباه است.';
      setLoginError(serverMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4 relative font-sans transition-colors duration-200">
      {/* دکمه تغییر تم */}
      <div className="absolute top-4 left-4 z-10">
        <button
          type="button"
          onClick={cycleTheme}
          title={`حالت تم: ${theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم'} (کلیک جهت تغییر)`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 dark:!border-slate-600 bg-white/95 dark:bg-slate-800/95 text-slate-700 dark:text-slate-200 dark:!text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition text-xs font-medium cursor-pointer shadow-sm"
        >
          {theme === 'dark' && <Moon className="w-4 h-4 text-indigo-400 shrink-0" />}
          {theme === 'light' && <Sun className="w-4 h-4 text-amber-500 shrink-0" />}
          {theme === 'system' && <Monitor className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />}
          <span>{theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم'}</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#252736] rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 border border-slate-100 dark:border-slate-800">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center bg-slate-900 dark:bg-transparent px-4 py-2 rounded-xl mx-auto">
            <img
              src="/branding/Logo-Type-fr.png"
              alt="نوافلو | NovaFlow"
              className="h-20 sm:h-24 w-auto mx-auto object-contain bg-transparent"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/branding/Logo.png';
              }}
            />
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 leading-snug">
            نوافلو | NovaFlow — درگاه یکپارچه فرم و گردشکار
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">سامانه هوشمند مدیریت فرآیندهای سازمانی</p>
        </div>

        {/* کادر هشدار خطا با جزئیات کامل و شفاف */}
        {loginError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-bold block mb-0.5">عدم امکان ورود:</span>
              <span>{loginError}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام کاربری یا ایمیل سازمانی</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="مثلاً: user@company.local یا local_admin"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">کلمه عبور</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
                title={showPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                aria-label={showPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition shadow-lg text-sm cursor-pointer"
          >
            {loading ? 'در حال احراز هویت...' : 'ورود به سامانه'}
          </button>
        </form>
      </div>
    </div>
  );
}
