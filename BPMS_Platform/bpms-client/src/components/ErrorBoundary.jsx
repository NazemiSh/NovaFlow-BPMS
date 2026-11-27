import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleClose = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({
            error: this.state.error,
            resetError: this.handleReset,
            close: this.handleClose
          });
        }
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || String(this.state.error || 'خطای نامشخص در رندر کامپوننت');

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-rose-200 dark:border-rose-900/60 shadow-2xl max-w-lg w-full overflow-hidden text-right font-['IRANSansX','IRANSans','Vazirmatn',sans-serif]">
            {/* هدر اعلان خطا */}
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-100 dark:border-rose-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h3 className="font-bold text-sm">
                  {this.props.title || 'خطا در بارگذاری بخش طراح قالب چاپ'}
                </h3>
              </div>
              <button
                type="button"
                onClick={this.handleClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition cursor-pointer"
                title="بستن پنجره"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* بدنه و شرح خطا */}
            <div className="p-5 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <p>
                متأسفانه در پردازش و نمایش این بخش خطای غیرمنتظره‌ای رخ داده است:
              </p>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-rose-600 dark:text-rose-400 break-all select-all">
                {errorMessage}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                می‌توانید پنجره را ببندید یا با کلیک روی دکمه «تلاش مجدد»، بارگذاری کامپوننت را دوباره امتحان کنید.
              </p>
            </div>

            {/* فوتر دکمه‌ها */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
              <button
                type="button"
                onClick={this.handleClose}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
                <span>بستن پنجره</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
