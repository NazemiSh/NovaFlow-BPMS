import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  HelpCircle,
  Info,
  MessageSquareText,
  X,
  XCircle
} from 'lucide-react';

const DialogContext = createContext(null);

const TOAST_STYLES = {
  success: {
    icon: CheckCircle2,
    borderClass: 'border-emerald-200 dark:border-emerald-500/40',
    accentClass: 'bg-emerald-500',
    iconBoxClass: 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    titleDefault: 'عملیات موفق'
  },
  error: {
    icon: XCircle,
    borderClass: 'border-rose-200 dark:border-rose-500/40',
    accentClass: 'bg-rose-500',
    iconBoxClass: 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400',
    titleDefault: 'خطا'
  },
  warning: {
    icon: AlertTriangle,
    borderClass: 'border-amber-200 dark:border-amber-500/40',
    accentClass: 'bg-amber-500',
    iconBoxClass: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
    titleDefault: 'هشدار'
  },
  info: {
    icon: Info,
    borderClass: 'border-blue-200 dark:border-blue-500/40',
    accentClass: 'bg-blue-500',
    iconBoxClass: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
    titleDefault: 'اطلاع‌رسانی'
  }
};

const MODAL_VARIANTS = {
  primary: {
    headerBg: 'bg-blue-50/70 dark:bg-blue-500/10',
    iconBox: 'bg-blue-600 text-white shadow-md shadow-blue-500/20',
    button: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md',
    icon: HelpCircle
  },
  warning: {
    headerBg: 'bg-amber-50/80 dark:bg-amber-500/10',
    iconBox: 'bg-amber-500 text-white shadow-md shadow-amber-500/20',
    button: 'bg-amber-600 hover:bg-amber-700 text-white shadow-md',
    icon: AlertTriangle
  },
  danger: {
    headerBg: 'bg-rose-50/80 dark:bg-rose-500/10',
    iconBox: 'bg-rose-600 text-white shadow-md shadow-rose-500/20',
    button: 'bg-rose-600 hover:bg-rose-700 text-white shadow-md',
    icon: AlertTriangle
  }
};

function sanitizeToastMessage(rawMessage) {
  return String(rawMessage ?? '').replace(/^(?:✅|⚠️|⚠|❌)\s*/u, '').trim();
}

function ToastItem({ item, onDismiss }) {
  const [isPaused, setIsPaused] = useState(false);
  const style = TOAST_STYLES[item.type] || TOAST_STYLES.info;
  const IconComp = style.icon;

  useEffect(() => {
    if (isPaused || !item.duration || item.duration <= 0) return undefined;
    const timer = setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, isPaused, onDismiss]);

  return (
    <div
      role="status"
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative overflow-hidden bg-white dark:bg-[#252736] border ${style.borderClass} rounded-2xl shadow-xl p-3.5 pr-4 flex items-start gap-3 text-right animate-in fade-in slide-in-from-left-4 duration-200`}
    >
      <div className={`absolute inset-y-0 right-0 w-1 ${style.accentClass}`} />
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${style.iconBoxClass}`}>
        <IconComp className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        {item.title && (
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">
            {item.title}
          </div>
        )}
        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line break-words">
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="بستن اعلان"
        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ConfirmDialogModal({ dialog, onResolve }) {
  const variant = MODAL_VARIANTS[dialog.variant] || MODAL_VARIANTS.primary;
  const IconComp = variant.icon;

  return (
    <div
      data-bpms-global-modal="true"
      onClick={() => onResolve(false)}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150 no-print"
    >
      {/* از role="alertdialog" استفاده شده تا قانون CSS عمومی [role="dialog"] > div > div در تم تاریک تداخلی ایجاد نکند */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bpms-global-confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#252736] w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden text-right animate-in zoom-in-95 duration-150"
      >
        <div className={`px-5 py-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3 ${variant.headerBg}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${variant.iconBox}`}>
              <IconComp className="w-5 h-5" />
            </div>
            <h3 id="bpms-global-confirm-title" className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate">
              {dialog.title || 'تایید عملیات'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onResolve(false)}
            aria-label="بستن پنجره"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line break-words">
            {dialog.message}
          </p>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1e2030] flex items-center justify-end gap-2.5">
          <button
            type="button"
            autoFocus={dialog.variant === 'danger'}
            onClick={() => onResolve(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition cursor-pointer"
          >
            {dialog.cancelText || 'انصراف'}
          </button>
          <button
            type="button"
            autoFocus={dialog.variant !== 'danger'}
            onClick={() => onResolve(true)}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${variant.button}`}
          >
            {dialog.confirmText || 'تایید'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptDialogModal({ dialog, onResolve }) {
  const [value, setValue] = useState(dialog.defaultValue ?? '');
  const [validationError, setValidationError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  const variant = MODAL_VARIANTS[dialog.variant] || MODAL_VARIANTS.primary;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        if (dialog.selectAllOnFocus && typeof inputRef.current.select === 'function') {
          inputRef.current.select();
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [dialog.selectAllOnFocus]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (dialog.required && !String(value).trim()) {
      setValidationError(dialog.requiredMessage || 'لطفاً مقدار مورد نظر را وارد نمایید.');
      inputRef.current?.focus();
      return;
    }
    onResolve(value);
  };

  const handleCopyValue = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (inputRef.current) {
        inputRef.current.select();
      }
    }
  };

  return (
    <div
      data-bpms-global-modal="true"
      onClick={() => onResolve(null)}
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150 no-print"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="bpms-global-prompt-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-[#252736] w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden text-right animate-in zoom-in-95 duration-150"
      >
        <div className={`px-5 py-4 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-3 ${variant.headerBg}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${variant.iconBox}`}>
              <MessageSquareText className="w-5 h-5" />
            </div>
            <h3 id="bpms-global-prompt-title" className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 truncate">
              {dialog.title || 'ورود اطلاعات'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onResolve(null)}
            aria-label="بستن پنجره"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 sm:p-6 space-y-3">
            {dialog.message && (
              <label
                htmlFor="bpms-global-prompt-input"
                className="block text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line"
              >
                {dialog.message}
              </label>
            )}

            <div className="relative">
              {dialog.multiline ? (
                <textarea
                  ref={inputRef}
                  id="bpms-global-prompt-input"
                  rows={3}
                  dir={dialog.dir || 'rtl'}
                  readOnly={Boolean(dialog.readOnly)}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder={dialog.placeholder || ''}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white dark:bg-[#333645] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                    validationError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  } ${dialog.dir === 'ltr' ? 'font-mono text-left' : ''}`}
                />
              ) : (
                <input
                  ref={inputRef}
                  id="bpms-global-prompt-input"
                  type="text"
                  dir={dialog.dir || 'rtl'}
                  readOnly={Boolean(dialog.readOnly)}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (validationError) setValidationError('');
                  }}
                  placeholder={dialog.placeholder || ''}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm bg-white dark:bg-[#333645] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    dialog.showCopyButton ? 'pl-10' : ''
                  } ${
                    validationError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-200 dark:border-slate-700'
                  } ${dialog.dir === 'ltr' ? 'font-mono text-left' : ''}`}
                />
              )}

              {dialog.showCopyButton && (
                <button
                  type="button"
                  onClick={handleCopyValue}
                  title="کپی در حافظه"
                  aria-label="کپی در حافظه"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>

            {validationError && (
              <p className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{validationError}</span>
              </p>
            )}
          </div>

          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-700/80 bg-slate-50 dark:bg-[#1e2030] flex items-center justify-end gap-2.5">
            {!dialog.hideCancel && (
              <button
                type="button"
                onClick={() => onResolve(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition cursor-pointer"
              >
                {dialog.cancelText || 'انصراف'}
              </button>
            )}
            <button
              type="submit"
              className={`px-5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${variant.button}`}
            >
              {dialog.confirmText || 'تایید'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * ارائه‌دهنده متمرکز اعلان‌های شناور (Toast) و مودال‌های تاییدیه (Confirm) و ورود متن (Prompt)
 */
export function GlobalDialogProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialogQueue, setDialogQueue] = useState([]);
  const idCounterRef = useRef(0);

  const activeDialog = dialogQueue[0] || null;

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', durationOrOptions = {}) => {
    const cleanMsg = sanitizeToastMessage(message);
    if (!cleanMsg) return null;

    const opts = typeof durationOrOptions === 'number'
      ? { duration: durationOrOptions }
      : (durationOrOptions || {});

    const id = `bpms_toast_${++idCounterRef.current}`;
    const defaultDuration = (type === 'error' || type === 'warning') ? 6000 : 4500;
    const duration = opts.duration !== undefined ? opts.duration : defaultDuration;

    setToasts((prev) => {
      const next = [...prev, { id, type, message: cleanMsg, title: opts.title, duration }];
      // محدودسازی حداکثر ۵ اعلان همزمان جهت جلوگیری از شلوغی صفحه
      return next.slice(-5);
    });
    return id;
  }, []);

  const toast = useMemo(() => ({
    success: (message, durationOrOptions) => showToast(message, 'success', durationOrOptions),
    error: (message, durationOrOptions) => showToast(message, 'error', durationOrOptions),
    warning: (message, durationOrOptions) => showToast(message, 'warning', durationOrOptions),
    info: (message, durationOrOptions) => showToast(message, 'info', durationOrOptions)
  }), [showToast]);

  const confirm = useCallback((messageOrOptions) => {
    const opts = typeof messageOrOptions === 'string'
      ? { message: messageOrOptions }
      : (messageOrOptions || {});

    return new Promise((resolve) => {
      setDialogQueue((prev) => [
        ...prev,
        {
          id: `bpms_dlg_${++idCounterRef.current}`,
          kind: 'confirm',
          variant: opts.variant || 'primary',
          title: opts.title,
          message: opts.message || '',
          confirmText: opts.confirmText,
          cancelText: opts.cancelText,
          resolve
        }
      ]);
    });
  }, []);

  const prompt = useCallback((messageOrOptions, defaultValue = '') => {
    const opts = typeof messageOrOptions === 'string'
      ? { message: messageOrOptions, defaultValue }
      : (messageOrOptions || {});

    return new Promise((resolve) => {
      setDialogQueue((prev) => [
        ...prev,
        {
          id: `bpms_dlg_${++idCounterRef.current}`,
          kind: 'prompt',
          variant: opts.variant || 'primary',
          title: opts.title,
          message: opts.message || '',
          placeholder: opts.placeholder,
          defaultValue: opts.defaultValue !== undefined ? opts.defaultValue : defaultValue,
          confirmText: opts.confirmText,
          cancelText: opts.cancelText,
          hideCancel: opts.hideCancel,
          required: opts.required,
          requiredMessage: opts.requiredMessage,
          multiline: opts.multiline,
          readOnly: opts.readOnly,
          dir: opts.dir,
          selectAllOnFocus: opts.selectAllOnFocus,
          showCopyButton: opts.showCopyButton,
          resolve
        }
      ]);
    });
  }, []);

  const handleResolveActive = useCallback((result) => {
    setDialogQueue((prev) => {
      if (prev.length === 0) return prev;
      const [current, ...rest] = prev;
      current.resolve(result);
      return rest;
    });
  }, []);

  // پشتیبانی از کلید Escape برای بستن و لغو مودال فعال
  useEffect(() => {
    if (!activeDialog) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleResolveActive(activeDialog.kind === 'confirm' ? false : null);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeDialog, handleResolveActive]);

  const contextValue = useMemo(() => ({
    toast,
    showToast,
    dismissToast,
    confirm,
    prompt
  }), [toast, showToast, dismissToast, confirm, prompt]);

  return (
    <DialogContext.Provider value={contextValue}>
      {children}

      {/* ظرف اعلان‌های شناور در گوشه بالا-چپ (متناسب با چیدمان RTL و سایدبار راست) */}
      {toasts.length > 0 && (
        <div
          dir="rtl"
          className="fixed top-4 left-4 sm:top-5 sm:left-5 z-[10010] flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm pointer-events-none no-print"
        >
          {toasts.map((item) => (
            <ToastItem key={item.id} item={item} onDismiss={dismissToast} />
          ))}
        </div>
      )}

      {/* رندر مودال تاییدیه یا ورود متن فعال */}
      {activeDialog?.kind === 'confirm' && (
        <ConfirmDialogModal
          key={activeDialog.id}
          dialog={activeDialog}
          onResolve={handleResolveActive}
        />
      )}

      {activeDialog?.kind === 'prompt' && (
        <PromptDialogModal
          key={activeDialog.id}
          dialog={activeDialog}
          onResolve={handleResolveActive}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used inside a GlobalDialogProvider.');
  }
  return ctx;
}

export default GlobalDialogProvider;
