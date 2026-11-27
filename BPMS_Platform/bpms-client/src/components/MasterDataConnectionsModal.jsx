import React from 'react';
import { Server, Play, CheckCircle2, XCircle, X, KeyRound, ShieldCheck } from 'lucide-react';

export default function MasterDataConnectionsModal({
  isOpen,
  onClose,
  editingConn,
  connForm,
  setConnForm,
  handleSaveConnection,
  connTesting,
  connTestResult,
  handleTestConnection
}) {
  if (!isOpen) return null;

  const isWindowsAuth = connForm.authType === 'Windows';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1e2030] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#181926]">
          <div className="flex items-center gap-2.5">
            <Server className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
              {editingConn ? 'ویرایش اتصال پایگاه‌داده' : 'تعریف اتصال جدید به SQL Server'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSaveConnection} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              نام مشخصه اتصال <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={connForm.name}
              onChange={(e) => setConnForm({ ...connForm, name: e.target.value })}
              placeholder="مثال: پایگاه‌داده مالی و حسابداری همکاران سیستم"
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                آدرس سرور یا IP <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={connForm.serverAddress}
                onChange={(e) => setConnForm({ ...connForm, serverAddress: e.target.value })}
                placeholder="192.168.1.10 یا srv\SQLEXPRESS"
                className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 text-left"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                نام پایگاه‌داده (Database) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={connForm.databaseName}
                onChange={(e) => setConnForm({ ...connForm, databaseName: e.target.value })}
                placeholder="AccountingDB"
                className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 text-left"
              />
            </div>
          </div>

          {/* نوع احراز هویت */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              نوع احراز هویت (Authentication Type) <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConnForm({ ...connForm, authType: 'Sql' })}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  !isWindowsAuth
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 dark:bg-[#181926] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <KeyRound className="w-4 h-4 text-blue-500" />
                <span>SQL Server Authentication</span>
              </button>

              <button
                type="button"
                onClick={() => setConnForm({ ...connForm, authType: 'Windows' })}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                  isWindowsAuth
                    ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-500 text-cyan-700 dark:text-cyan-300 ring-2 ring-cyan-500/20'
                    : 'bg-slate-50 dark:bg-[#181926] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-cyan-500" />
                <span>Windows / Active Directory</span>
              </button>
            </div>
          </div>

          {isWindowsAuth ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    نام کاربری دامنه / سرویس اکانت (اختیاری)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={connForm.username || ''}
                    onChange={(e) => setConnForm({ ...connForm, username: e.target.value })}
                    placeholder="DOMAIN\svc_sql یا خالی برای سرور"
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                    کلمه عبور سرویس اکانت {editingConn && <span className="text-slate-400 font-normal">(در صورت عدم تغییر خالی بگذارید)</span>}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    value={connForm.password || ''}
                    onChange={(e) => setConnForm({ ...connForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-cyan-500 text-left"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/80 dark:border-cyan-800/60 text-xs space-y-1">
                <div className="font-bold text-cyan-900 dark:text-cyan-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-600 shrink-0" />
                  <span>پشتیبانی از سرویس اکانت دامنه (RunImpersonated)</span>
                </div>
                <p className="text-cyan-700 dark:text-cyan-300 text-[11px] leading-relaxed">
                  در صورت وارد کردن نام کاربری و کلمه عبور، اتصال به SQL Server با هویت سرویس اکانت اکتیو دایرکتوری برقرار می‌شود. در صورت خالی گذاشتن، اتصال به صورت مستقیم با هویت پیش‌فرض سرویس IIS (Integrated Security) برقرار خواهد شد.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  نام کاربری SQL <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={connForm.username || ''}
                  onChange={(e) => setConnForm({ ...connForm, username: e.target.value })}
                  placeholder="bpms_readonly_user"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  کلمه عبور {editingConn && <span className="text-slate-400 font-normal">(در صورت عدم تغییر خالی بگذارید)</span>}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={connForm.password || ''}
                  onChange={(e) => setConnForm({ ...connForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500 text-left"
                />
              </div>
            </div>
          )}

          {/* نتیجه تست اتصال در مودال */}
          {connTestResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                connTestResult.success
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {connTestResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{connTestResult.message}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              disabled={connTesting}
              onClick={() => handleTestConnection(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-xs font-bold hover:bg-cyan-100 transition cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 ${connTesting ? 'animate-spin' : ''}`} />
              <span>{connTesting ? 'در حال برقراری اتصال...' : 'تست زنده اتصال'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                انصراف
              </button>

              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
              >
                ذخیره اتصال
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
