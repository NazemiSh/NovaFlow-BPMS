import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../api';
import {
  DatabaseBackup,
  HardDriveDownload,
  HardDriveUpload,
  FolderArchive,
  RotateCcw,
  Trash2,
  Download,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  CalendarClock,
  Settings,
  ShieldCheck,
  FileText,
  Users,
  Layers,
  FileSpreadsheet,
  Sparkles,
  RefreshCw,
  Play,
  Check,
  X,
  ChevronDown,
  Save,
  HelpCircle,
  FileBox,
  FileUp,
  Server
} from 'lucide-react';
import PersianDatePicker, { toPersianDateTime, getTodayJalaliStr } from './PersianDatePicker';
import { useDialog } from './GlobalDialogProvider';

const ALL_MODULES = [
  { id: 'users', label: 'کاربران، نقش‌ها و گروه‌ها', desc: 'اطلاعات کاربران، نقش‌ها، گروه‌های سازمانی و اعضا', icon: Users, color: 'text-blue-500' },
  { id: 'forms', label: 'تعاریف فرم‌ها و دسترسی‌ها', desc: 'ساختار فیلدها، دسترسی گروه‌ها و نسخه‌های فرم', icon: FileSpreadsheet, color: 'text-amber-500' },
  { id: 'data', label: 'درخواست‌ها، کارتابل و گردش‌کار', desc: 'داده‌های ثبت‌شده، رونوشت‌ها و تاریخچه اقدامات', icon: Layers, color: 'text-blue-500' },
  { id: 'settings', label: 'تنظیمات سامانه، AD و AI', desc: 'تنظیمات اکتیو دایرکتوری، کلیدها و هوش مصنوعی', icon: Settings, color: 'text-blue-500' },
  { id: 'uploads', label: 'فایل‌های پیوست و لوگوها', desc: 'اسناد بارگذاری‌شده در پوشه uploads و لوگوی سامانه', icon: FolderArchive, color: 'text-emerald-500' }
];

const WEEK_DAYS = [
  { key: 'Saturday', label: 'شنبه' },
  { key: 'Sunday', label: 'یک‌شنبه' },
  { key: 'Monday', label: 'دوشنبه' },
  { key: 'Tuesday', label: 'سه‌شنبه' },
  { key: 'Wednesday', label: 'چهارشنبه' },
  { key: 'Thursday', label: 'پنج‌شنبه' },
  { key: 'Friday', label: 'جمعه' }
];

export default function BackupRestoreTab({ user }) {
  const { confirm } = useDialog();
  // وضعیت کلی و آمار
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [statusData, setStatusData] = useState(null);

  // کارت ۱: پشتیبان‌گیری دستی
  const [manualModules, setManualModules] = useState(['users', 'forms', 'data', 'settings', 'uploads']);
  const [manualNote, setManualNote] = useState('');
  const [creatingManualBackup, setCreatingManualBackup] = useState(false);
  const [manualActionType, setManualActionType] = useState(''); // 'download' or 'server'

  // کارت ۲: زمان‌بندی خودکار
  const [scheduleConfig, setScheduleConfig] = useState({
    isEnabled: false,
    dateMode: 'recurring',
    recurrenceType: 'daily',
    daysOfWeek: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    dayOfMonth: 1,
    specificDate: getTodayJalaliStr(),
    specificDateRepeat: 'none',
    startTime: '02:00',
    continueRunningIntraDay: false,
    intraDayIntervalHours: 2,
    lastRunTime: '22:00',
    storagePath: 'App_Data/Backups',
    maxRetainedBackups: 10,
    modules: ['users', 'forms', 'data', 'settings', 'uploads'],
    lastRunAtPersian: '',
    lastRunStatus: '',
    lastRunMessage: '',
    nextRunAtPersian: ''
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [triggeringSchedule, setTriggeringSchedule] = useState(false);

  // کارت ۳: لیست بکاپ‌ها و بازیابی
  const [backupList, setBackupList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listFilter, setListFilter] = useState('ALL'); // 'ALL', 'Manual', 'Scheduled'
  const [listSearch, setListSearch] = useState('');

  // آپلود فایل بکاپ
  const fileInputRef = useRef(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [uploadingPreview, setUploadingPreview] = useState(false);

  // مودال پیش‌نمایش و بازیابی
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewManifest, setPreviewManifest] = useState(null);
  const [previewSource, setPreviewSource] = useState(null); // { type: 'server', fileName: '...' } or { type: 'upload', file: File }
  const [selectedRestoreModules, setSelectedRestoreModules] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState(null);

  // پیام اعلان‌ها (Alerts)
  const [alertInfo, setAlertInfo] = useState(null);

  const showAlert = (type, message) => {
    setAlertInfo({ type, message });
    setTimeout(() => {
      setAlertInfo(null);
    }, 6000);
  };

  // بارگذاری اولیه داده‌ها
  const fetchData = async () => {
    setLoadingStatus(true);
    setLoadingList(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        api.get('/admin/backup/status'),
        api.get('/admin/backup/list')
      ]);

      if (statusRes.data) {
        setStatusData(statusRes.data);
        if (statusRes.data.schedule) {
          setScheduleConfig(prev => ({
            ...prev,
            ...statusRes.data.schedule,
            modules: statusRes.data.schedule.modules?.length ? statusRes.data.schedule.modules : prev.modules
          }));
        }
      }

      if (Array.isArray(listRes.data)) {
        setBackupList(listRes.data);
      }
    } catch (err) {
      console.error('Error fetching backup data:', err);
      showAlert('error', 'خطا در بارگذاری اطلاعات پشتیبان‌گیری: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingStatus(false);
      setLoadingList(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- کارت ۱: توابع پشتیبان‌گیری دستی ---
  const handleToggleAllManual = () => {
    if (manualModules.length === ALL_MODULES.length) {
      setManualModules([]);
    } else {
      setManualModules(ALL_MODULES.map(m => m.id));
    }
  };

  const handleToggleManualModule = (id) => {
    if (manualModules.includes(id)) {
      setManualModules(manualModules.filter(m => m !== id));
    } else {
      setManualModules([...manualModules, id]);
    }
  };

  const handleCreateManualBackup = async (saveToServer) => {
    if (manualModules.length === 0) {
      showAlert('warning', 'لطفاً حداقل یک ماژول را برای پشتیبان‌گیری انتخاب فرمایید.');
      return;
    }

    setCreatingManualBackup(true);
    setManualActionType(saveToServer ? 'server' : 'download');

    try {
      if (saveToServer) {
        const res = await api.post('/admin/backup/create', {
          modules: manualModules,
          saveToServer: true,
          customNote: manualNote
        });
        showAlert('success', res.data?.message || 'نسخه پشتیبان با موفقیت در مخزن سرور ذخیره شد.');
        fetchData();
      } else {
        // دانلود مستقیم فایل با فرمت .bpmsbackup
        const res = await api.post('/admin/backup/create', {
          modules: manualModules,
          saveToServer: false,
          customNote: manualNote
        }, {
          responseType: 'blob'
        });

        const blob = new Blob([res.data], { type: 'application/octet-stream' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        link.setAttribute('download', `BPMS_Backup_${timestamp}.bpmsbackup`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
        showAlert('success', 'فایل نسخه پشتیبان (.bpmsbackup) با موفقیت ایجاد و دانلود شد.');
      }
    } catch (err) {
      console.error('Backup creation error:', err);
      showAlert('error', 'خطا در تهیه نسخه پشتیبان: ' + (err.response?.data?.message || err.message));
    } finally {
      setCreatingManualBackup(false);
      setManualActionType('');
    }
  };

  // --- کارت ۲: توابع زمان‌بندی خودکار ---
  const handleToggleScheduleModule = (id) => {
    setScheduleConfig(prev => {
      const current = prev.modules || [];
      const updated = current.includes(id)
        ? current.filter(m => m !== id)
        : [...current, id];
      return { ...prev, modules: updated };
    });
  };

  const handleToggleDayOfWeek = (dayKey) => {
    setScheduleConfig(prev => {
      const current = prev.daysOfWeek || [];
      let updated;
      if (current.includes(dayKey)) {
        if (current.length === 1) return prev; // حداقل یک روز باید فعال بماند
        updated = current.filter(d => d !== dayKey);
      } else {
        updated = [...current, dayKey];
      }
      return { ...prev, daysOfWeek: updated };
    });
  };

  const handleSaveScheduleConfig = async () => {
    if (scheduleConfig.isEnabled && (!scheduleConfig.modules || scheduleConfig.modules.length === 0)) {
      showAlert('warning', 'لطفاً حداقل یک ماژول را برای پشتیبان‌گیری خودکار انتخاب فرمایید.');
      return;
    }

    setSavingSchedule(true);
    try {
      const res = await api.post('/admin/backup/config', scheduleConfig);
      showAlert('success', res.data?.message || 'تنظیمات زمان‌بندی با موفقیت ذخیره گردید.');
      if (res.data?.config) {
        setScheduleConfig(prev => ({ ...prev, ...res.data.config }));
      }
      fetchData();
    } catch (err) {
      console.error('Save schedule error:', err);
      showAlert('error', 'خطا در ذخیره زمان‌بندی: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleTriggerScheduleNow = async () => {
    const confirmed = await confirm({
      title: 'اجرای فوری پشتیبان‌گیری',
      message: 'آیا مایل به اجرای فوری عملیات پشتیبان‌گیری طبق برنامه زمان‌بندی هستید؟',
      confirmText: 'اجرای پشتیبان‌گیری',
      variant: 'primary'
    });
    if (!confirmed) {
      return;
    }

    setTriggeringSchedule(true);
    try {
      const res = await api.post('/admin/backup/trigger-schedule');
      showAlert('success', res.data?.message || 'عملیات با موفقیت اجرا شد.');
      fetchData();
    } catch (err) {
      console.error('Trigger schedule error:', err);
      showAlert('error', 'خطا در اجرای زمان‌بندی: ' + (err.response?.data?.message || err.message));
    } finally {
      setTriggeringSchedule(false);
    }
  };

  // --- کارت ۳: توابع لیست بکاپ‌ها، دانلود، حذف و بازیابی ---
  const handleDownloadServerBackup = (fileName) => {
    const url = `/api/admin/backup/download/${encodeURIComponent(fileName)}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDeleteServerBackup = async (fileName) => {
    const confirmed = await confirm({
      title: 'حذف نسخه پشتیبان',
      message: `آیا از حذف دائمی نسخه پشتیبان "${fileName}" اطمینان دارید؟`,
      confirmText: 'تایید و حذف دائمی',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/admin/backup/${encodeURIComponent(fileName)}`);
      showAlert('success', `فایل ${fileName} با موفقیت حذف گردید.`);
      setBackupList(prev => prev.filter(b => b.fileName !== fileName));
    } catch (err) {
      showAlert('error', 'خطا در حذف فایل پشتیبان: ' + (err.response?.data?.message || err.message));
    }
  };

  // پیش‌نمایش بکاپ از سرور
  const handleOpenRestoreFromServer = async (backupItem) => {
    setLoadingList(true);
    try {
      const formData = new FormData();
      formData.append('fileName', backupItem.fileName);
      const res = await api.post('/admin/backup/preview', formData);

      setPreviewManifest(res.data);
      setPreviewSource({ type: 'server', fileName: backupItem.fileName });
      setSelectedRestoreModules(res.data.modules?.length ? res.data.modules : ['users', 'forms', 'data', 'settings', 'uploads']);
      setRestoreFeedback(null);
      setPreviewModalOpen(true);
    } catch (err) {
      showAlert('error', 'خطا در خواندن فایل پشتیبان: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoadingList(false);
    }
  };

  // آپلود فایل بکاپ از کامپیوتر کاربر
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.bpmsbackup') && !file.name.endsWith('.zip')) {
      showAlert('warning', 'لطفاً یک فایل معتبر با پسوند .bpmsbackup انتخاب فرمایید.');
      return;
    }

    setSelectedUploadFile(file);
    setUploadingPreview(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/admin/backup/preview', formData);

      setPreviewManifest(res.data);
      setPreviewSource({ type: 'upload', file });
      setSelectedRestoreModules(res.data.modules?.length ? res.data.modules : ['users', 'forms', 'data', 'settings', 'uploads']);
      setRestoreFeedback(null);
      setPreviewModalOpen(true);
    } catch (err) {
      console.error('File preview error:', err);
      showAlert('error', 'فایل نامعتبر است یا ساختار بسته پشتیبان استاندارد BPMS را ندارد: ' + (err.response?.data?.message || err.message));
      setSelectedUploadFile(null);
    } finally {
      setUploadingPreview(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // اجرای نهایی بازیابی
  const handleExecuteRestore = async () => {
    if (!selectedRestoreModules || selectedRestoreModules.length === 0) {
      showAlert('warning', 'حداقل یک ماژول را برای بازیابی انتخاب فرمایید.');
      return;
    }

    const confirmed = await confirm({
      title: 'هشدار مهم بازیابی اطلاعات',
      message: 'آیا از اجرای عملیات بازیابی اطمینان دارید؟ داده‌های ماژول‌های انتخاب‌شده همگام‌سازی و جایگزین خواهند شد.',
      confirmText: 'تایید و اجرای بازیابی',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }

    setRestoring(true);
    setRestoreFeedback(null);

    try {
      const formData = new FormData();
      formData.append('modulesJson', JSON.stringify(selectedRestoreModules));

      if (previewSource.type === 'server') {
        formData.append('fileName', previewSource.fileName);
      } else if (previewSource.type === 'upload') {
        formData.append('file', previewSource.file);
      }

      const res = await api.post('/admin/backup/restore', formData);
      setRestoreFeedback({
        success: true,
        message: res.data.message || 'بازیابی با موفقیت کامل انجام شد.',
        counts: res.data.restoredCounts || {}
      });
      showAlert('success', 'اطلاعات با موفقیت بازیابی شد.');
      fetchData();
    } catch (err) {
      console.error('Restore error:', err);
      const errMsg = err.response?.data?.message || err.message || 'خطای ناشناخته در بازیابی';
      setRestoreFeedback({
        success: false,
        message: 'خطا در انجام عملیات بازیابی: ' + errMsg,
        errors: err.response?.data?.errors || []
      });
      showAlert('error', 'بازیابی با خطا مواجه شد: ' + errMsg);
    } finally {
      setRestoring(false);
    }
  };

  // فیلتر لیست بکاپ‌ها
  const filteredBackups = useMemo(() => {
    return backupList.filter(b => {
      if (listFilter === 'Manual' && b.backupType !== 'Manual') return false;
      if (listFilter === 'Scheduled' && b.backupType !== 'Scheduled') return false;
      if (listSearch) {
        const q = listSearch.toLowerCase();
        const matchesName = b.fileName?.toLowerCase().includes(q);
        const matchesDate = b.createdAtPersian?.includes(q);
        const matchesNote = b.customNote?.toLowerCase().includes(q);
        return matchesName || matchesDate || matchesNote;
      }
      return true;
    });
  }, [backupList, listFilter, listSearch]);

  // زمان‌های ساعت و دقیقه
  const hoursList = useMemo(() => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), []);
  const minutesList = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), []);

  const parseHourMin = (timeStr) => {
    if (!timeStr || !timeStr.includes(':')) return { hour: '02', min: '00' };
    const [h, m] = timeStr.split(':');
    return { hour: h.padStart(2, '0'), min: m.padStart(2, '0') };
  };

  const startTimeObj = parseHourMin(scheduleConfig.startTime);
  const lastTimeObj = parseHourMin(scheduleConfig.lastRunTime);

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* هدر صفحه و کادر خلاصه وضعیت سرور */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <DatabaseBackup className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-lg sm:text-xl text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
              <span>مرکز پشتیبان‌گیری و بازیابی داده‌ها</span>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 font-mono">
                <bdi dir="ltr">.bpmsbackup</bdi>
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              تهیه نسخه‌های فشرده ساختاریافته از بانک‌اطلاعاتی و مستندات، زمان‌بندی خودکار فرآیند و بازیابی انتخابی و ایمن ماژول‌ها
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {statusData && (
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#1e2030] border border-slate-200/70 dark:border-slate-800 text-xs">
              <Server className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">فضای آزاد دیسک سرور:</span>
                <span dir="ltr" className="font-bold text-slate-700 dark:text-slate-200 text-right inline-block font-mono">
                  {statusData.storageFreeSpaceFormatted || '---'}
                </span>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">تعداد نسخه‌ها:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {statusData.totalBackupsCount || 0} نسخه
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={fetchData}
            disabled={loadingStatus}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-xs font-medium cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
            title="به‌روزرسانی اطلاعات"
            aria-label="تازه‌سازی مرکز پشتیبان‌گیری"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-emerald-600' : ''}`} />
            <span>تازه‌سازی</span>
          </button>
        </div>
      </div>

      {/* کادر اعلان‌ها (Toast/Alert) */}
      {alertInfo && (
        <div className={`p-4 rounded-2xl flex items-start gap-3 text-xs font-medium animate-in fade-in duration-200 border ${
          alertInfo.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/60'
            : alertInfo.type === 'warning'
            ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/60'
            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/60'
        }`}>
          {alertInfo.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
          {alertInfo.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
          {alertInfo.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
          <div className="flex-1 leading-relaxed">{alertInfo.message}</div>
          <button
            type="button"
            onClick={() => setAlertInfo(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* کارت ۱: پشتیبان‌گیری دستی و انتخابی (Manual Backup) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                پشتیبان‌گیری دستی و انتخابی (Manual Backup)
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                تعیین ماژول‌های مدنظر جهت ایجاد پکیج یکپارچه اطلاعاتی و انتخاب شیوه دریافت
              </p>
            </div>
          </div>

          {/* چک‌باکس انتخاب همه ماژول‌ها */}
          <button
            type="button"
            onClick={handleToggleAllManual}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1e2030] hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer self-start sm:self-center"
          >
            <input
              type="checkbox"
              readOnly
              checked={manualModules.length === ALL_MODULES.length}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
            />
            <span>{manualModules.length === ALL_MODULES.length ? 'لغو انتخاب همه' : 'انتخاب همه ماژول‌ها'}</span>
          </button>
        </div>

        {/* لیست ۵ ماژول انتخابی */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {ALL_MODULES.map((mod) => {
            const isSelected = manualModules.includes(mod.id);
            const IconComp = mod.icon;
            return (
              <label
                key={mod.id}
                onClick={() => handleToggleManualModule(mod.id)}
                className={`relative flex items-start gap-3.5 p-4 rounded-2xl border transition cursor-pointer select-none ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
                    : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1e2030]/60 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <IconComp className={`w-4 h-4 ${mod.color}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{mod.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{mod.desc}</p>
                </div>
              </label>
            );
          })}
        </div>

        {/* توضیحات / یادداشت اختیاری */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            یادداشت توضیحی برای نسخه پشتیبان (اختیاری)
          </label>
          <input
            type="text"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="مثلاً: بکاپ قبل از به‌روزرسانی فرم‌های منابع انسانی یا پایان ماه..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* دکمه‌های عملیاتی دستی */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3">
          <button
            type="button"
            disabled={creatingManualBackup || manualModules.length === 0}
            onClick={() => handleCreateManualBackup(false)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-bold text-xs transition shadow-md shadow-blue-500/20 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:from-slate-800 dark:disabled:to-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 cursor-pointer"
          >
            {creatingManualBackup && manualActionType === 'download' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>تهیه بکاپ و دانلود مستقیم فایل (<bdi dir="ltr">.bpmsbackup</bdi>)</span>
          </button>

          <button
            type="button"
            disabled={creatingManualBackup || manualModules.length === 0}
            onClick={() => handleCreateManualBackup(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-bold text-xs transition disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-300 disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 cursor-pointer"
          >
            {creatingManualBackup && manualActionType === 'server' ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <HardDriveDownload className="w-4 h-4" />
            )}
            <span>ذخیره بکاپ در مخزن سرور</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* کارت ۲: زمان‌بندی خودکار بکاپ (Task Scheduler) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#232536] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>زمان‌بندی خودکار پشتیبان‌گیری (Task Scheduler)</span>
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                اجرای خودکار و دوره‌ای فرآیند پشتیبان‌گیری در پس‌زمینه سرور با الگوی استاندارد زمان‌بندی و سیاست نگهداری
              </p>
            </div>
          </div>

          {/* کلید سوئیچ فعال‌سازی زمان‌بندی */}
          <div className="flex items-center gap-3 self-start sm:self-center bg-slate-50 dark:bg-[#1b1c29] px-4 py-2 rounded-2xl border border-slate-200/70 dark:border-slate-700/80">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {scheduleConfig.isEnabled ? 'سرویس فعال است' : 'سرویس غیرفعال است'}
            </span>
            <button
              type="button"
              onClick={() => setScheduleConfig(prev => ({ ...prev, isEnabled: !prev.isEnabled }))}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                scheduleConfig.isEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  scheduleConfig.isEnabled ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* کادر وضعیت آخرین اجرا و اجرای بعدی */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 dark:bg-[#1b1c29] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400 dark:text-slate-400 block text-[11px]">وضعیت زمان‌بند:</span>
            <span className={`font-bold inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${
              scheduleConfig.isEnabled
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${scheduleConfig.isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {scheduleConfig.isEnabled ? 'فعال و در حال مانیتور (۳۰ ثانیه)' : 'غیرفعال'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 dark:text-slate-400 block text-[11px]">آخرین زمان اجرا:</span>
            <span dir="ltr" className="font-semibold text-slate-700 dark:text-slate-200 font-mono text-right inline-block">
              {scheduleConfig.lastRunAtPersian || 'تاکنون اجرا نشده'}
            </span>
            {scheduleConfig.lastRunStatus && (
              <span className={`text-[10px] font-bold mr-2 px-1.5 py-0.5 rounded ${
                scheduleConfig.lastRunStatus === 'Success' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' : 'text-rose-600 bg-rose-50 dark:bg-rose-950/60'
              }`}>
                {scheduleConfig.lastRunStatus === 'Success' ? 'موفق' : 'ناموفق'}
              </span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 dark:text-slate-400 block text-[11px]">زمان اجرای بعدی:</span>
            <span dir="ltr" className="font-bold text-blue-700 dark:text-sky-300 font-mono text-right inline-block">
              {scheduleConfig.isEnabled ? (scheduleConfig.nextRunAtPersian || 'در اولین فرصت مقرر') : '---'}
            </span>
          </div>
        </div>

        {/* بخش ۱: تاریخ (Date) */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-r-2 border-blue-600 dark:border-sky-500 pr-2">
            <span>۱. تنظیمات تاریخ اجرا (Date)</span>
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* گزینه ۱: روزهای مشخص */}
            <div
              onClick={() => {
                if (scheduleConfig.dateMode !== 'recurring') {
                  setScheduleConfig(prev => ({ ...prev, dateMode: 'recurring' }));
                }
              }}
              className={`p-4 rounded-2xl border transition cursor-pointer space-y-3 ${
                scheduleConfig.dateMode === 'recurring'
                  ? 'border-blue-500/70 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-[#1b1c29]/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="dateMode"
                  checked={scheduleConfig.dateMode === 'recurring'}
                  onChange={() => setScheduleConfig(prev => ({ ...prev, dateMode: 'recurring' }))}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  گزینه ۱: اجرا در روزهای مشخص (Run on the following days)
                </span>
              </div>

              {scheduleConfig.dateMode === 'recurring' && (
                <div className="space-y-3 pt-2" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">دوره تکرار:</label>
                    <select
                      value={scheduleConfig.recurrenceType}
                      onChange={(e) => setScheduleConfig(prev => ({ ...prev, recurrenceType: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="daily">روزانه (Daily — هر روز هفته)</option>
                      <option value="weekly">هفتگی (Weekly — روزهای انتخابی هفته)</option>
                      <option value="monthly">ماهانه (Monthly — روز مشخص از ماه)</option>
                    </select>
                  </div>

                  {scheduleConfig.recurrenceType === 'weekly' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">روزهای هفته:</label>
                      <div className="flex flex-wrap gap-1.5">
                        {WEEK_DAYS.map(day => {
                          const active = (scheduleConfig.daysOfWeek || []).includes(day.key);
                          return (
                            <button
                              key={day.key}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleDayOfWeek(day.key);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer select-none ${
                                active
                                  ? 'bg-blue-600 text-white font-bold shadow-sm ring-1 ring-blue-400/40'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {scheduleConfig.recurrenceType === 'monthly' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">روز ماه (شمسی):</label>
                      <select
                        value={scheduleConfig.dayOfMonth}
                        onChange={(e) => setScheduleConfig(prev => ({ ...prev, dayOfMonth: parseInt(e.target.value, 10) }))}
                        className="w-36 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>روز {d} هر ماه</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* گزینه ۲: تاریخ مشخص */}
            <div
              onClick={() => {
                if (scheduleConfig.dateMode !== 'specificDate') {
                  setScheduleConfig(prev => ({ ...prev, dateMode: 'specificDate' }));
                }
              }}
              className={`p-4 rounded-2xl border transition cursor-pointer space-y-3 ${
                scheduleConfig.dateMode === 'specificDate'
                  ? 'border-blue-500/70 bg-blue-50/20 dark:bg-blue-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-[#1b1c29]/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <input
                  type="radio"
                  name="dateMode"
                  checked={scheduleConfig.dateMode === 'specificDate'}
                  onChange={() => setScheduleConfig(prev => ({ ...prev, dateMode: 'specificDate' }))}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  گزینه ۲: اجرا در تاریخ مشخص (Run on the following date)
                </span>
              </div>

              {scheduleConfig.dateMode === 'specificDate' && (
                <div className="space-y-3 pt-2" onClick={(e) => e.stopPropagation()}>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">تاریخ شروع (شمسی):</label>
                    <PersianDatePicker
                      value={scheduleConfig.specificDate}
                      onChange={(val) => setScheduleConfig(prev => ({ ...prev, specificDate: val }))}
                      placeholder="انتخاب تاریخ شمسی..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">الگوی تکرار:</label>
                    <select
                      value={scheduleConfig.specificDateRepeat}
                      onChange={(e) => setScheduleConfig(prev => ({ ...prev, specificDateRepeat: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="none">بدون تکرار (Do not repeat — فقط در همان روز)</option>
                      <option value="daily">روزانه (Daily — تکرار هر روز پس از تاریخ شروع)</option>
                      <option value="weekly">هفتگی (Weekly — تکرار در همان روز هفته)</option>
                      <option value="monthly">ماهانه (Monthly — تکرار در همان روز از ماه)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* بخش ۲: زمان (Time) */}
        <div className="space-y-4 pt-2">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-r-2 border-blue-600 dark:border-sky-500 pr-2">
            <span>۲. تنظیمات زمان اجرا (Time)</span>
          </h4>

          <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-[#1b1c29]/50 space-y-4">
            {/* انتخابگر ساعت شروع */}
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">ساعت شروع اجرا (Start time):</span>
              <div dir="ltr" className="flex items-center gap-1.5">
                <select
                  value={startTimeObj.hour}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, startTime: `${e.target.value}:${startTimeObj.min}` }))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500"
                >
                  {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="font-bold text-slate-400">:</span>
                <select
                  value={startTimeObj.min}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, startTime: `${startTimeObj.hour}:${e.target.value}` }))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500"
                >
                  {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* چک‌باکس ادامه اجرا در طول همان روز */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={scheduleConfig.continueRunningIntraDay}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, continueRunningIntraDay: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  ادامه اجرا در طول همان روز (Continue running within the same day)
                </span>
              </label>

              {scheduleConfig.continueRunningIntraDay && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pr-6 pt-2 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">بازه تکرار در طول روز:</label>
                    <select
                      value={scheduleConfig.intraDayIntervalHours}
                      onChange={(e) => setScheduleConfig(prev => ({ ...prev, intraDayIntervalHours: parseInt(e.target.value, 10) }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={1}>هر ۱ ساعت</option>
                      <option value={2}>هر ۲ ساعت</option>
                      <option value={4}>هر ۴ ساعت</option>
                      <option value={6}>هر ۶ ساعت</option>
                      <option value={12}>هر ۱۲ ساعت</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">آخرین زمان اجرا (Last run time):</label>
                    <div dir="ltr" className="flex items-center gap-1.5">
                      <select
                        value={lastTimeObj.hour}
                        onChange={(e) => setScheduleConfig(prev => ({ ...prev, lastRunTime: `${e.target.value}:${lastTimeObj.min}` }))}
                        className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500 w-full"
                      >
                        {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span className="font-bold text-slate-400">:</span>
                      <select
                        value={lastTimeObj.min}
                        onChange={(e) => setScheduleConfig(prev => ({ ...prev, lastRunTime: `${lastTimeObj.hour}:${e.target.value}` }))}
                        className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-xs font-bold font-mono focus:ring-2 focus:ring-blue-500 w-full"
                      >
                        {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* بخش ۳: سیاست نگهداری و ذخیره‌سازی (Retention & Storage) */}
        <div className="space-y-4 pt-2">
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 border-r-2 border-blue-600 dark:border-sky-500 pr-2">
            <span>۳. سیاست نگهداری و ماژول‌ها (Retention & Storage)</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                حداکثر تعداد نسخه‌های پشتیبان قابل نگهداری (Keep last N backups)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={scheduleConfig.maxRetainedBackups}
                  onChange={(e) => setScheduleConfig(prev => ({ ...prev, maxRetainedBackups: parseInt(e.target.value, 10) || 10 }))}
                  className="w-32 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs font-bold"
                />
                <span className="text-xs text-slate-400">نسخه (نسخه‌های قدیمی‌تر به صورت خودکار حذف می‌شوند)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                مسیر پوشه ذخیره‌سازی در سرور
              </label>
              <input
                type="text"
                dir="ltr"
                value={scheduleConfig.storagePath}
                onChange={(e) => setScheduleConfig(prev => ({ ...prev, storagePath: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs font-mono text-left"
                placeholder="App_Data/Backups"
              />
            </div>
          </div>

          {/* ماژول‌های مشمول زمان‌بندی */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              ماژول‌های مشمول پشتیبان‌گیری خودکار:
            </label>
            <div className="flex flex-wrap gap-2.5">
              {ALL_MODULES.map(m => {
                const checked = (scheduleConfig.modules || []).includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleScheduleModule(m.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition cursor-pointer ${
                      checked
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500/60 text-blue-800 dark:text-sky-200 font-bold'
                        : 'bg-white dark:bg-[#1b1c29] border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 pointer-events-none"
                    />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* دکمه‌های اکشن زمان‌بندی */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={triggeringSchedule}
            onClick={handleTriggerScheduleNow}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-sky-300 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
          >
            {triggeringSchedule ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>اجرای فوری بکاپ زمان‌بندی‌شده (Run Now)</span>
          </button>

          <button
            type="button"
            disabled={savingSchedule}
            onClick={handleSaveScheduleConfig}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer"
          >
            {savingSchedule ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>ذخیره تنظیمات زمان‌بندی</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* کارت ۳: تاریخچه نسخه‌های پشتیبان و بازیابی (Backup History & Restore) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 md:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                تاریخچه نسخه‌های پشتیبان و بازیابی (Backup History & Restore)
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-400 mt-0.5">
                مدیریت فایل‌های ذخیره‌شده در سرور، بازیابی اطلاعات یا آپلود فایل <bdi dir="ltr" className="font-mono">.bpmsbackup</bdi> از رایانه
              </p>
            </div>
          </div>

          {/* فیلترها و جستجو */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto self-start sm:self-center">
            <div className="flex flex-wrap items-center bg-slate-100 dark:bg-[#1e2030] p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setListFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  listFilter === 'ALL' ? 'bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 shadow-2xs font-bold' : 'text-slate-500'
                }`}
              >
                همه ({backupList.length})
              </button>
              <button
                type="button"
                onClick={() => setListFilter('Manual')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  listFilter === 'Manual' ? 'bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 shadow-2xs font-bold' : 'text-slate-500'
                }`}
              >
                دستی
              </button>
              <button
                type="button"
                onClick={() => setListFilter('Scheduled')}
                className={`px-3 py-1 rounded-lg font-medium transition ${
                  listFilter === 'Scheduled' ? 'bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 shadow-2xs font-bold' : 'text-slate-500'
                }`}
              >
                زمان‌بندی‌شده
              </button>
            </div>

            <input
              type="text"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="جستجو در فایل‌ها..."
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 w-full sm:w-44"
            />
          </div>
        </div>

        {/* بخش آپلود فایل بکاپ از رایانه کاربر */}
        <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-dashed border-emerald-300 dark:border-emerald-800/80 rounded-2xl p-5 text-center space-y-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".bpmsbackup,.zip"
            className="hidden"
          />
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            {uploadingPreview ? <RefreshCw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              بازیابی از طریق بارگذاری فایل (<bdi dir="ltr" className="font-mono">.bpmsbackup</bdi>) از رایانه شما
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              فایل پشتیبان را انتخاب نمایید تا قبل از اجرای بازیابی، پیش‌نمایش کامل داده‌ها و ماژول‌های آن به شما نمایش داده شود.
            </p>
          </div>
          <button
            type="button"
            disabled={uploadingPreview}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <HardDriveUpload className="w-4 h-4" />
            <span>{uploadingPreview ? 'در حال تحلیل بسته پشتیبان...' : 'انتخاب و بارگذاری فایل پشتیبان'}</span>
          </button>
        </div>

        {/* جدول فایل‌های پشتیبان روی سرور */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-medium">
                <th className="py-3 px-4">نام فایل پشتیبان</th>
                <th className="py-3 px-4">تاریخ ایجاد (شمسی)</th>
                <th className="py-3 px-4">حجم فایل</th>
                <th className="py-3 px-4">نوع نسخه</th>
                <th className="py-3 px-4">ماژول‌های مشمول</th>
                <th className="py-3 px-4 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
              {loadingList ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    <span>در حال دریافت لیست نسخه‌های پشتیبان...</span>
                  </td>
                </tr>
              ) : filteredBackups.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-slate-400">
                    <FolderArchive className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                    <span>هیچ فایل پشتیبانی با فیلتر انتخابی در مخزن سرور یافت نشد.</span>
                  </td>
                </tr>
              ) : (
                filteredBackups.map((b) => (
                  <tr key={b.fileName} className="hover:bg-slate-50/70 dark:hover:bg-[#1e2030]/50 transition">
                    <td dir="ltr" className="py-3.5 px-4 font-mono font-medium text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="truncate max-w-[220px]" title={b.fileName}>{b.fileName}</span>
                        <FileBox className="w-4 h-4 text-slate-400 shrink-0" />
                      </div>
                      {b.customNote && (
                        <span dir="rtl" className="text-[10px] text-slate-400 block font-sans truncate max-w-[220px]">
                          {b.customNote}
                        </span>
                      )}
                    </td>
                    <td dir="ltr" className="py-3.5 px-4 font-medium whitespace-nowrap text-right font-mono">
                      {b.createdAtPersian || '---'}
                    </td>
                    <td dir="ltr" className="py-3.5 px-4 whitespace-nowrap font-mono text-right">
                      {b.fileSizeFormatted}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        b.backupType === 'Scheduled'
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                      }`}>
                        {b.backupType === 'Scheduled' ? 'زمان‌بندی‌شده' : 'دستی'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {(b.modules || []).map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                            {m === 'users' ? 'کاربران' : m === 'forms' ? 'فرم‌ها' : m === 'data' ? 'کارتابل' : m === 'settings' ? 'تنظیمات' : 'فایل‌ها'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadServerBackup(b.fileName)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-400 transition"
                          title="دانلود فایل به رایانه شما"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenRestoreFromServer(b)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition font-bold text-[11px]"
                          title="پیش‌نمایش و بازیابی این نسخه"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>بازیابی</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteServerBackup(b.fileName)}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-400 hover:text-rose-600 hover:border-rose-400 transition"
                          title="حذف فایل از سرور"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* مودال پیش‌نمایش و تایید نهایی بازیابی (Restore Preview Modal) */}
      {/* ========================================================================= */}
      {previewModalOpen && previewManifest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#252736] w-full max-w-2xl rounded-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in duration-200 border border-slate-200 dark:border-slate-700">
            {/* هدر مودال */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-[#1e2030]/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    پیش‌نمایش محتویات و تایید بازیابی نسخه پشتیبان
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    منبع فایل: {previewSource?.type === 'server' ? `مخزن سرور (${previewSource.fileName})` : `آپلود مستقیم (${previewSource?.file?.name})`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* بدنه مودال */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* خلاصه مشخصات بسته پشتیبان */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-[#1e2030] p-3.5 rounded-2xl border border-slate-200/70 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[10px]">تاریخ تهیه بکاپ:</span>
                  <span dir="ltr" className="font-bold text-slate-800 dark:text-slate-200 font-mono text-right inline-block">
                    {previewManifest.createdAtPersian || '---'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">نسخه سامانه:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {previewManifest.systemVersion || '1.0.0'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">نوع پشتیبان:</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {previewManifest.backupType === 'Scheduled' ? 'زمان‌بندی‌شده' : 'دستی'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">ماژول‌های موجود:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {(previewManifest.modules || []).length} ماژول
                  </span>
                </div>
              </div>

              {previewManifest.customNote && (
                <div className="bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/40 text-blue-900 dark:text-blue-300 text-xs">
                  <span className="font-bold block mb-0.5">یادداشت ثبت‌شده روی این نسخه:</span>
                  <span>{previewManifest.customNote}</span>
                </div>
              )}

              {/* انتخاب ماژول‌های مشمول بازیابی */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 dark:text-slate-200 block">
                    انتخاب ماژول‌ها جهت بازیابی در سامانه:
                  </span>
                  <span className="text-[11px] text-slate-400">
                    (تنها ماژول‌های تیک‌خورده بازیابی خواهند شد)
                  </span>
                </div>

                <div className="space-y-2">
                  {ALL_MODULES.map((mod) => {
                    const isPresentInBackup = (previewManifest.modules || []).includes(mod.id);
                    const isChecked = selectedRestoreModules.includes(mod.id);
                    const summary = previewManifest.moduleSummaries?.[mod.id] || '';
                    const IconComp = mod.icon;

                    if (!isPresentInBackup) {
                      return (
                        <div
                          key={mod.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20 opacity-50 select-none"
                        >
                          <div className="flex items-center gap-2.5">
                            <IconComp className="w-4 h-4 text-slate-400" />
                            <span className="font-medium text-slate-400">{mod.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">در این فایل بکاپ وجود ندارد</span>
                        </div>
                      );
                    }

                    return (
                      <label
                        key={mod.id}
                        className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none ${
                          isChecked
                            ? 'border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e2030]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedRestoreModules(selectedRestoreModules.filter(m => m !== mod.id));
                              } else {
                                setSelectedRestoreModules([...selectedRestoreModules, mod.id]);
                              }
                            }}
                            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100 block">{mod.label}</span>
                            {summary && (
                              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                                محتوا: {summary}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200">
                          آماده بازیابی
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* هشدار ایمنی فرآیند */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-3.5 rounded-xl text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold block mb-0.5">هشدار مهم ایمنی دیتابیس:</span>
                  <span>
                    عملیات بازیابی به صورت تراکنشی (Transactional) انجام می‌پذیرد تا از تمامیت کلیدهای خارجی اطمینان حاصل شود. در صورت انطباق کلیدها، اطلاعات موجود با داده‌های نسخه پشتیبان به‌روزرسانی خواهند شد.
                  </span>
                </div>
              </div>

              {/* فیدبک پس از اجرای بازیابی */}
              {restoreFeedback && (
                <div className={`p-4 rounded-xl border text-xs ${
                  restoreFeedback.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 text-rose-800 dark:text-rose-200'
                }`}>
                  <div className="font-bold flex items-center gap-2 mb-2">
                    {restoreFeedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                    <span>{restoreFeedback.message}</span>
                  </div>
                  {restoreFeedback.counts && Object.keys(restoreFeedback.counts).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 text-[11px]">
                      {Object.entries(restoreFeedback.counts).map(([tbl, count]) => (
                        <span key={tbl} className="bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 rounded border border-emerald-200/50">
                          {tbl}: {count} رکورد
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* فوتر مودال */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-[#1e2030]/50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-300 hover:bg-slate-100 font-semibold text-xs transition cursor-pointer"
              >
                انصراف
              </button>

              <button
                type="button"
                disabled={restoring || selectedRestoreModules.length === 0}
                onClick={handleExecuteRestore}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-md shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
              >
                {restoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span>{restoring ? 'در حال بازیابی اطلاعات...' : 'تایید و شروع عملیات بازیابی (Restore)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
