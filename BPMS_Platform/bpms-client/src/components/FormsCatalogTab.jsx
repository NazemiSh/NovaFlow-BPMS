import React, { useState, useMemo, useEffect } from 'react';
import api from '../api';
import {
  RefreshCw,
  Search,
  FileText,
  Clock,
  Eye,
  CheckCircle,
  XCircle,
  Trash2,
  Copy,
  CopyPlus,
  Send,
  Share2,
  Download,
  Users,
  UserCheck,
  ShieldAlert,
  ArrowRightLeft,
  X
} from 'lucide-react';
import { isPublicSurveyClosed, getFormDeadlineInfo } from './PersianDatePicker';
import DuplicateFormTitleModal, { getSuggestedTitle } from './DuplicateFormTitleModal';
import { useDialog } from './GlobalDialogProvider';

export default function FormsCatalogTab({
  forms = [],
  user = {},
  usersList = [],
  fetchData,
  onOpenRunner,
  onCopyPublicLink,
  onExportFormSchema,
  onCloneForm,
  onCloneAsIndependentForm,
  onToggleStatus,
  onDeleteForm,
  onInspectForm,
  onAdminApproveForm,
  onAdminRejectForm
}) {
  const isPrivilegedCatalogUser = Boolean(user.roles?.includes('Admin') || user.roles?.includes('SuperUser'));
  const [sharingForm, setSharingForm] = useState(null);
  const [duplicateTitleModal, setDuplicateTitleModal] = useState({
    isOpen: false,
    form: null,
    title: '',
    suggestedTitle: ''
  });

  const handleInitiateClone = (targetForm) => {
    if (!targetForm) return;
    const cleanTitle = (targetForm.title || '').trim();
    // بررسی اینکه آیا فرمی با همین عنوان از قبل در سامانه وجود دارد یا خیر
    const duplicateExists = (forms || []).some(f => (f.title || '').trim().toLowerCase() === cleanTitle.toLowerCase());

    if (duplicateExists) {
      const allTitles = (forms || []).map(f => f.title);
      const suggested = getSuggestedTitle(cleanTitle, allTitles);
      setDuplicateTitleModal({
        isOpen: true,
        form: targetForm,
        title: cleanTitle,
        suggestedTitle: suggested
      });
      return;
    }

    if (onCloneAsIndependentForm) {
      onCloneAsIndependentForm(targetForm);
    }
  };

  const handleConfirmDuplicateAddNumber = () => {
    const { form, suggestedTitle } = duplicateTitleModal;
    setDuplicateTitleModal({ isOpen: false, form: null, title: '', suggestedTitle: '' });
    if (form && onCloneAsIndependentForm) {
      onCloneAsIndependentForm(form, suggestedTitle, true);
    }
  };

  const handleRenameManually = () => {
    const { form, title } = duplicateTitleModal;
    setDuplicateTitleModal({ isOpen: false, form: null, title: '', suggestedTitle: '' });
    if (form && onCloneAsIndependentForm) {
      onCloneAsIndependentForm(form, title, false);
    }
  };

  const groupedForms = useMemo(() => {
    return Object.values(
      forms.reduce((acc, f) => {
        const key = f.title || `form_${f.formID}`;
        if (!acc[key]) {
          acc[key] = {
            title: f.title,
            versions: []
          };
        }
        acc[key].versions.push(f);
        return acc;
      }, {})
    ).map(group => {
      const allSorted = [...group.versions].sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        return (b.revision || 0) - (a.revision || 0);
      });
      const activeVer = allSorted.find(v => v.status === 'Active');
      const sortedVersions = isPrivilegedCatalogUser
        ? allSorted
        : (activeVer ? [activeVer] : [allSorted[0]]);
      const currentActiveVersion = activeVer || sortedVersions[0];
      const isPublic = sortedVersions.some(v => {
        if (v.isPublic) return true;
        try {
          return JSON.parse(v.schemaJson || '{}')?.isPublic === true;
        } catch (e) {
          return false;
        }
      });
      return {
        title: group.title,
        versions: sortedVersions,
        activeVersion: currentActiveVersion,
        isPublic
      };
    });
  }, [forms, isPrivilegedCatalogUser]);

  const [selectedCatalogVersions, setSelectedCatalogVersions] = useState({});
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState(() => {
    return (user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) ? 'Active' : 'ALL';
  });
  const [catalogTypeFilter, setCatalogTypeFilter] = useState('ALL'); // 'ALL' | 'ORGANIZATIONAL' | 'PUBLIC'
  const [catalogCreatorFilter, setCatalogCreatorFilter] = useState('ALL'); // 'ALL' | 'MINE' | userID string
  const [catalogVersionFilter, setCatalogVersionFilter] = useState('ALL'); // 'ALL' | 'MULTI' | 'SINGLE'

  useEffect(() => {
    setCatalogStatusFilter((user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) ? 'Active' : 'ALL');
  }, [user]);

  const catalogCreatorIds = useMemo(() => {
    return Array.from(new Set(forms.map(f => f.createdByUserID).filter(Boolean)));
  }, [forms]);

  const filteredCatalogGroups = groupedForms.filter((group) => {
    // فیلتر نوع فرم (عمومی / سازمانی)
    if (catalogTypeFilter === 'PUBLIC' && !group.isPublic) return false;
    if (catalogTypeFilter === 'ORGANIZATIONAL' && group.isPublic) return false;

    // فیلتر تعداد نگارش‌ها
    if (catalogVersionFilter === 'MULTI' && group.versions.length <= 1) return false;
    if (catalogVersionFilter === 'SINGLE' && group.versions.length > 1) return false;

    // فیلتر طراح / ایجادکننده
    if (catalogCreatorFilter === 'MINE') {
      if (!group.versions.some(v => v.createdByUserID === user.userID)) return false;
    } else if (catalogCreatorFilter === 'SHARED') {
      if (!group.versions.some(v => v.isSharedWithMe)) return false;
    } else if (catalogCreatorFilter !== 'ALL') {
      const targetCreatorId = parseInt(catalogCreatorFilter, 10);
      if (!group.versions.some(v => v.createdByUserID === targetCreatorId)) return false;
    }

    // فیلتر وضعیت فرم
    const activeVerClosed = isPublicSurveyClosed(group.activeVersion).closed;
    if (catalogStatusFilter === 'Active') {
      if (group.activeVersion.status !== 'Active' || activeVerClosed) return false;
    } else if (catalogStatusFilter === 'INACTIVE') {
      if (group.activeVersion.status !== 'Archived' && !activeVerClosed) return false;
    } else if (catalogStatusFilter === 'HAS_ARCHIVED') {
      const hasActive = group.activeVersion.status === 'Active';
      const hasOlderArchived = group.versions.length > 1 && group.versions.some(v => v.status === 'Archived');
      if (!hasActive || !hasOlderArchived) return false;
    } else if (catalogStatusFilter !== 'ALL') {
      if (!group.versions.some(v => v.status === catalogStatusFilter)) return false;
    }

    // فیلتر جستجو در عنوان، توضیحات یا کد فرم
    if (catalogSearchTerm.trim()) {
      const q = catalogSearchTerm.trim().toLowerCase();
      const matchTitle = (group.title || '').toLowerCase().includes(q);
      const matchDesc = group.versions.some(v => (v.description || '').toLowerCase().includes(q));
      const matchId = group.versions.some(v => String(v.formID) === q || `کد ${v.formID}`.includes(q));
      if (!matchTitle && !matchDesc && !matchId) return false;
    }

    return true;
  });

  const hasCatalogFilters =
    catalogSearchTerm.trim() !== '' ||
    catalogStatusFilter !== 'Active' ||
    catalogTypeFilter !== 'ALL' ||
    catalogCreatorFilter !== 'ALL' ||
    catalogVersionFilter !== 'ALL';

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-6 space-y-6">
      {/* هدر استاندارد کاتالوگ فرم‌ها */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-700/80">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-slate-800 dark:text-slate-100">
              کاتالوگ فرم‌های در دسترس شما
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              جهت ثبت درخواست یا انتخاب نگارش‌های مختلف فرم‌ها، از کارت‌های زیر استفاده کنید.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchData(false)}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          title="به‌روزرسانی لیست"
          aria-label="تازه‌سازی کاتالوگ فرم‌ها"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* نوار فیلتر جامع کاتالوگ فرم‌ها */}
      <div className="bg-slate-50 dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* ۱. جستجوی متنی (عرض دو برابر) */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={catalogSearchTerm}
              onChange={(e) => setCatalogSearchTerm(e.target.value)}
              placeholder="جستجو نام فرم، توضیحات یا کد..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* ۲. فیلتر وضعیت */}
          <div>
            <select
              value={catalogStatusFilter}
              onChange={(e) => setCatalogStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Active">وضعیت: فرم‌های فعال</option>
              <option value="INACTIVE">وضعیت: فرم‌های غیرفعال</option>
              <option value="HAS_ARCHIVED">وضعیت: دارای ورژن بایگانی</option>
              <option value="PendingApproval">وضعیت: در انتظار تایید مدیر سیستم</option>
              <option value="RejectedByAdmin">وضعیت: رد شده توسط مدیر سیستم</option>
              <option value="ALL">وضعیت: همه فرم‌ها</option>
            </select>
          </div>

          {/* ۳. فیلتر نوع فرم */}
          <div>
            <select
              value={catalogTypeFilter}
              onChange={(e) => setCatalogTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">نوع فرم: همه فرم‌ها</option>
              <option value="ORGANIZATIONAL">فرم‌های فرآیندی سازمانی</option>
              <option value="PUBLIC">عمومی / نظرسنجی</option>
            </select>
          </div>

          {/* ۴. فیلتر طراح / ایجادکننده */}
          <div>
            <select
              value={catalogCreatorFilter}
              onChange={(e) => setCatalogCreatorFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">طراح فرم: همه طراحان</option>
              <option value="MINE">فقط فرم‌های ایجادشده توسط من</option>
              <option value="SHARED">فرم‌های اشتراک‌گذاری‌شده با من</option>
              {user.roles?.includes('Admin') && catalogCreatorIds.map(cid => {
                const cUser = usersList.find(u => u.userID === cid);
                return (
                  <option key={cid} value={String(cid)}>
                    {cUser ? (cUser.displayName || cUser.username) : `کاربر #${cid}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* ۵. فیلتر نگارش‌ها */}
          <div>
            <select
              value={catalogVersionFilter}
              onChange={(e) => setCatalogVersionFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">نگارش: همه فرم‌ها</option>
              <option value="MULTI">دارای چند نگارش (تاریخچه‌دار)</option>
              <option value="SINGLE">تک‌نگارشی</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          <span>
            نمایش <b>{filteredCatalogGroups.length}</b> عنوان فرم از مجموع <b>{groupedForms.length}</b> فرم در دسترس
          </span>
          {hasCatalogFilters && (
            <button
              type="button"
              onClick={() => {
                setCatalogSearchTerm('');
                setCatalogStatusFilter('Active');
                setCatalogTypeFilter('ALL');
                setCatalogCreatorFilter('ALL');
                setCatalogVersionFilter('ALL');
              }}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
            >
              پاک کردن تمام فیلترها
            </button>
          )}
        </div>
      </div>

      {filteredCatalogGroups.length === 0 ? (
        <div className="text-center py-16 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <span>هیچ فرمی با فیلترهای انتخاب‌شده یافت نشد.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[650px] overflow-y-auto pr-1">
          {filteredCatalogGroups.map((group) => {
            const defaultVersionForFilter =
              (catalogStatusFilter === 'PendingApproval' || catalogStatusFilter === 'RejectedByAdmin')
                ? (group.versions.find(v => v.status === catalogStatusFilter) || group.activeVersion)
                : group.activeVersion;
            const selectedId = selectedCatalogVersions[group.title] || defaultVersionForFilter.formID;
            const currentForm = group.versions.find(v => v.formID === selectedId) || defaultVersionForFilter;
            const surveyDeadlineCheck = isPublicSurveyClosed(currentForm);
            const deadlineInfo = getFormDeadlineInfo(currentForm);
            const isExpiredByTime = currentForm.status === 'Active' && surveyDeadlineCheck.expiredByTime;
            const isCurrentInUse = (currentForm.formID === group.activeVersion.formID && currentForm.status === 'Active' && !isExpiredByTime);
            const isPendingApproval = currentForm.status === 'PendingApproval';
            const isRejectedByAdmin = currentForm.status === 'RejectedByAdmin';
            const creatorUser = usersList.find(u => u.userID === currentForm.createdByUserID);

            return (
              <div key={group.title} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-5 hover:border-slate-300 dark:hover:border-slate-600 transition bg-white dark:bg-[#1e2030] shadow-2xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-base">{group.title}</span>
                        {group.isPublic && (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                            عمومی / نظرسنجی
                          </span>
                        )}
                        {deadlineInfo && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold border flex items-center gap-1 ${isExpiredByTime
                              ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                              : 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                            }`}>
                            <Clock className="w-3 h-3" />
                            <span>{isExpiredByTime ? 'منقضی شده:' : 'مهلت:'} {deadlineInfo.closeDate} ({deadlineInfo.closeTime || '23:59'})</span>
                          </span>
                        )}
                        {isPendingApproval && (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                            در انتظار تایید مدیر سیستم
                          </span>
                        )}
                        {isRejectedByAdmin && (
                          <span className="text-[10px] bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                            رد شده توسط مدیر سیستم
                          </span>
                        )}
                        {currentForm.isSharedWithMe && (
                          <span className="text-[10px] bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-full font-bold">
                            اشتراک‌گذاری‌شده
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{currentForm.description || 'بدون توضیحات'}</p>
                      {(user.roles?.includes('Admin') || currentForm.isSharedWithMe) && (creatorUser || currentForm.createdByUserName) && (
                        <span className="text-[11px] text-slate-400 block mt-1">
                          طراح فرم: <b>{creatorUser ? (creatorUser.displayName || creatorUser.username) : currentForm.createdByUserName}</b>
                        </span>
                      )}
                    </div>

                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold shrink-0 ${isCurrentInUse ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30' : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                      }`}>
                      نگارش {currentForm.version}.{currentForm.revision}
                    </span>
                  </div>

                  {group.versions.length > 1 && (
                    <div className="bg-slate-50 dark:bg-[#252736] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold shrink-0">انتخاب نگارش:</span>
                      <select
                        value={currentForm.formID}
                        onChange={(e) => {
                          setSelectedCatalogVersions({
                            ...selectedCatalogVersions,
                            [group.title]: parseInt(e.target.value, 10)
                          });
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] font-medium text-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 max-w-xs"
                      >
                        {group.versions.map(v => (
                          <option key={v.formID} value={v.formID}>
                            نگارش {v.version}.{v.revision} (کد {v.formID}) {v.status === 'PendingApproval' ? '⏳ (در انتظار تایید)' : v.formID === group.activeVersion.formID ? '⭐ (جاری)' : '(بایگانی)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/80">
                  {isPendingApproval ? (
                    <div className="flex items-center gap-2">
                      {user.roles?.includes('Admin') ? (
                        <div className="flex items-center gap-2 w-full flex-wrap">
                          <button
                            onClick={() => onInspectForm(currentForm)}
                            className="bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>بررسی فرم و JSON</span>
                          </button>
                          <button
                            onClick={() => onAdminApproveForm(currentForm)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>تایید و فعال‌سازی</span>
                          </button>
                          <button
                            onClick={() => onAdminRejectForm(currentForm)}
                            className="bg-rose-600 hover:bg-rose-700 text-white text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>رد فرم</span>
                          </button>
                          <button
                            onClick={() => onDeleteForm(currentForm)}
                            className="bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs px-2.5 py-2 rounded-xl font-medium transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                            title="حذف این رکورد تکراری / معلق"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 p-2.5 rounded-xl text-center flex-1 font-medium">
                          این فرم جهت انتشار در انتظار بررسی و تایید مدیر سیستم است.
                        </div>
                      )}
                    </div>
                  ) : isRejectedByAdmin ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onCloneForm(currentForm)}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>ویرایش، اصلاح و ارسال مجدد جهت تایید</span>
                      </button>
                      {user.roles?.includes('Admin') && (
                        <button
                          onClick={() => onDeleteForm(currentForm)}
                          className="bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs px-2.5 py-2 rounded-xl font-medium transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          title="حذف فرم"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : isCurrentInUse ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => onOpenRunner(currentForm)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>تکمیل فرم</span>
                      </button>

                      {group.isPublic && (
                        <button
                          onClick={() => onCopyPublicLink(currentForm)}
                          className="bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-xs px-3 py-2 rounded-xl font-medium transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          title="کپی آدرس نظرسنجی عمومی"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>لینک عمومی</span>
                        </button>
                      )}

                      {(user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
                        <>
                          <button
                            onClick={() => onExportFormSchema(currentForm)}
                            className="bg-slate-50 dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs px-2.5 py-2 rounded-xl font-medium transition whitespace-nowrap shrink-0 cursor-pointer"
                            title="دانلود فایل JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID || currentForm.canEditDesign) && (
                            <button
                              onClick={() => onCloneForm(currentForm)}
                              className="bg-slate-100 dark:bg-[#252736] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs px-3 py-2 rounded-xl font-medium transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              title="ایجاد نگارش جدید با حفظ کد فرم"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخه جدید</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleInitiateClone(currentForm)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                            title="کپی به عنوان فرم مستقل"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                            <span>کپی</span>
                          </button>

                          {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID || currentForm.canShare) && (
                            <button
                              onClick={() => setSharingForm(currentForm)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                              title="مدیریت اشتراک‌گذاری فرم و دسترسی کاربران ارشد"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>اشتراک‌گذاری</span>
                            </button>
                          )}
                        </>
                      )}

                      {(user.roles?.includes('Admin') || (group.isPublic && currentForm.createdByUserID === user.userID)) && (
                        <button
                          onClick={() => onToggleStatus(currentForm)}
                          className={`${currentForm.status === 'Active' ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                            } border text-xs px-3 py-2 rounded-xl font-medium transition whitespace-nowrap shrink-0 cursor-pointer`}
                        >
                          {currentForm.status === 'Active' ? 'غیرفعال' : 'فعال'}
                        </button>
                      )}

                      {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID) && (
                        <button
                          onClick={() => onDeleteForm(currentForm)}
                          className="bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs px-2.5 py-2 rounded-xl font-medium transition flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                          title="حذف فرم"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className={`text-[11px] px-3 py-1.5 rounded-xl font-medium flex items-center justify-between ${isExpiredByTime ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}>
                        <span>
                          {isExpiredByTime
                            ? `⏰ مهلت زمانی این فرم (${deadlineInfo?.closeDate} - ${deadlineInfo?.closeTime}) به پایان رسیده و غیرفعال شده است.`
                            : '⚠️ این نگارش غیرفعال یا بایگانی شده است.'}
                        </span>
                        <span className="font-mono opacity-70">کد: {currentForm.formID}</span>
                      </div>

                      {(user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onExportFormSchema(currentForm)}
                            className="bg-slate-100 dark:bg-[#252736] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs px-2.5 py-2 rounded-xl font-medium transition whitespace-nowrap shrink-0 cursor-pointer"
                            title="دانلود فایل JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID || currentForm.canEditDesign) && (
                            <button
                              onClick={() => onCloneForm(currentForm)}
                              className="flex-1 bg-indigo-50 dark:bg-indigo-500/15 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                              title="ایجاد نسخه جدید از روی این نگارش"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخه جدید</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleInitiateClone(currentForm)}
                            className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 text-xs py-2 px-3 rounded-xl font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                            title="کپی به عنوان فرم مستقل"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                            <span>کپی</span>
                          </button>

                          {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID || currentForm.canShare) && (
                            <button
                              onClick={() => setSharingForm(currentForm)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                              title="مدیریت اشتراک‌گذاری فرم و دسترسی کاربران ارشد"
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>اشتراک‌گذاری</span>
                            </button>
                          )}

                          {(user.roles?.includes('Admin') || (group.isPublic && currentForm.createdByUserID === user.userID)) && (
                            <button
                              onClick={() => onToggleStatus(currentForm)}
                              className="bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 text-xs px-3 py-2 rounded-xl font-medium transition whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              فعال‌سازی
                            </button>
                          )}

                          {(user.roles?.includes('Admin') || currentForm.createdByUserID === user.userID) && (
                            <button
                              onClick={() => onDeleteForm(currentForm)}
                              className="bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 text-xs px-2.5 py-2 rounded-xl font-medium transition whitespace-nowrap shrink-0 cursor-pointer"
                              title="حذف این نگارش"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sharingForm && (
        <FormShareModal
          form={sharingForm}
          user={user}
          onClose={() => setSharingForm(null)}
          onRefresh={fetchData}
        />
      )}

      {/* مودال ممانعت از ایجاد فرم با عنوان تکراری */}
      <DuplicateFormTitleModal
        isOpen={duplicateTitleModal.isOpen}
        title={duplicateTitleModal.title}
        suggestedTitle={duplicateTitleModal.suggestedTitle}
        onAddNumberAndSave={handleConfirmDuplicateAddNumber}
        onRenameManually={handleRenameManually}
        onClose={handleRenameManually}
      />
    </div>
  );
}

function FormShareModal({ form, user, onClose, onRefresh }) {
  const { toast, confirm } = useDialog();
  const [candidates, setCandidates] = useState([]);
  const [shares, setShares] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [canEditDesign, setCanEditDesign] = useState(true);
  const [canViewReports, setCanViewReports] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferUserId, setTransferUserId] = useState('');
  const [transferring, setTransferring] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [candRes, shareRes] = await Promise.all([
        api.get(`/forms/${form.formID}/share-candidates`),
        api.get(`/forms/${form.formID}/shares`)
      ]);
      const candList = candRes.data || [];
      setCandidates(candList);
      setShares(shareRes.data || []);
      if (candList.length > 0) {
        setSelectedUserId(String(candList[0].userID));
        setTransferUserId(String(candList[0].userID));
      }
    } catch (err) {
      console.error('Error loading form shares:', err);
      toast.error('خطا در دریافت اطلاعات اشتراک فرم: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [form.formID]);

  const handleAddOrUpdateShare = async (e) => {
    e?.preventDefault();
    if (!selectedUserId) {
      toast.warning('لطفاً یک کاربر ارشد را انتخاب نمایید.');
      return;
    }
    if (!canEditDesign && !canViewReports) {
      toast.warning('حداقل یکی از دو دسترسی ساخت/ویرایش یا گزارش‌گیری باید فعال باشد.');
      return;
    }
    try {
      setSaving(true);
      const res = await api.post(`/forms/${form.formID}/shares`, {
        sharedWithUserId: parseInt(selectedUserId, 10),
        canEditDesign,
        canViewReports
      });
      toast.success(res.data?.message || 'دسترسی با موفقیت ذخیره شد.');
      await loadData();
      if (onRefresh) onRefresh(false);
    } catch (err) {
      toast.error('خطا در ثبت اشتراک: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermission = async (share, permKey, newValue) => {
    try {
      const payload = {
        sharedWithUserId: share.sharedWithUserId,
        canEditDesign: permKey === 'canEditDesign' ? newValue : share.canEditDesign,
        canViewReports: permKey === 'canViewReports' ? newValue : share.canViewReports
      };
      await api.post(`/forms/${form.formID}/shares`, payload);
      setShares(prev => prev.map(s => s.id === share.id ? { ...s, [permKey]: newValue } : s));
      if (onRefresh) onRefresh(false);
    } catch (err) {
      toast.error('خطا در به‌روزرسانی دسترسی: ' + (err.response?.data?.message || err.message));
      await loadData();
    }
  };

  const handleDeleteShare = async (targetUserId, targetName) => {
    const confirmed = await confirm({
      title: 'لغو دسترسی اشتراک',
      message: `آیا از لغو دسترسی اشتراک «${targetName}» به این فرم اطمینان دارید؟`,
      confirmText: 'تایید و لغو دسترسی',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await api.delete(`/forms/${form.formID}/shares/${targetUserId}`);
      toast.success('دسترسی کاربر با موفقیت لغو شد.');
      await loadData();
      if (onRefresh) onRefresh(false);
    } catch (err) {
      toast.error('خطا در حذف اشتراک: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferUserId) {
      toast.warning('لطفاً کاربر ارشد مقصد را انتخاب نمایید.');
      return;
    }
    const targetUser = candidates.find(c => String(c.userID) === String(transferUserId));
    const targetName = targetUser ? (targetUser.displayName || targetUser.username) : `شناسه ${transferUserId}`;

    const confirmed = await confirm({
      title: 'هشدار امنیتی انتقال مالکیت فرم',
      message: `آیا از واگذاری مالکیت کامل فرم «${form.title}» در تمامی نگارش‌های آن به «${targetName}» اطمینان دارید؟\nطراح اصلی فرم تغییر خواهد کرد و اختیارات مالکیتی فرم به این کاربر ارشد واگذار می‌شود.`,
      confirmText: 'تایید و انتقال مالکیت',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }

    try {
      setTransferring(true);
      const res = await api.post(`/forms/${form.formID}/transfer-ownership`, {
        newOwnerUserId: parseInt(transferUserId, 10)
      });
      toast.success(res.data?.message || 'مالکیت فرم با موفقیت واگذار شد.');
      if (onRefresh) onRefresh(false);
      onClose();
    } catch (err) {
      toast.error('خطا در انتقال مالکیت فرم: ' + (err.response?.data?.message || err.message));
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-base">
              اشتراک‌گذاری فرم «{form.title}»
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* بخش اول: افزودن یا تغییر دسترسی کاربر ارشد */}
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>اشتراک‌گذاری با کاربر ارشد (SuperUser) جدید</span>
          </h4>

          {loading ? (
            <div className="text-xs text-slate-500 py-3 text-center">در حال بارگذاری کاربران...</div>
          ) : candidates.length === 0 ? (
            <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
              کاربر ارشد (SuperUser) فعال دیگری در سیستم یافت نشد.
            </div>
          ) : (
            <form onSubmit={handleAddOrUpdateShare} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                  انتخاب کاربر ارشد مقصد:
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {candidates.map(c => (
                    <option key={c.userID} value={c.userID}>
                      {c.displayName || c.username} ({c.username}) {c.roles?.includes('Admin') ? '— مدیر سیستم' : '— کاربر ارشد'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-6 pt-1 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={canEditDesign}
                    onChange={(e) => setCanEditDesign(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>ساخت نگارش و ویرایش فرم (طراحی)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={canViewReports}
                    onChange={(e) => setCanViewReports(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <span>مشاهده گزارش‌ها و تحلیل داده‌ها</span>
                </label>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{saving ? 'در حال ثبت...' : 'ثبت / به‌روزرسانی دسترسی'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* بخش دوم: لیست نفراتی که فرم با آنها به اشتراک گذاشته شده */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
            کاربران دارای دسترسی به این فرم ({shares.length} نفر)
          </h4>

          {loading ? (
            <div className="text-xs text-slate-400 py-4 text-center">در حال بارگذاری لیست اشتراک...</div>
          ) : shares.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
              این فرم هنوز با هیچ کاربر ارشدی به اشتراک گذاشته نشده است.
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">کاربر ارشد</th>
                    <th className="p-2.5 text-center">ویرایش و نگارش جدید</th>
                    <th className="p-2.5 text-center">گزارش‌گیری و تحلیل</th>
                    <th className="p-2.5 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {shares.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-2.5">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {s.sharedWithDisplayName || s.sharedWithUsername}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          @{s.sharedWithUsername}
                        </div>
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={s.canEditDesign}
                          onChange={(e) => handleTogglePermission(s, 'canEditDesign', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          title="تغییر دسترسی ویرایش و نگارش جدید"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={s.canViewReports}
                          onChange={(e) => handleTogglePermission(s, 'canViewReports', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                          title="تغییر دسترسی گزارش‌گیری و تحلیل"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteShare(s.sharedWithUserId, s.sharedWithDisplayName || s.sharedWithUsername)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="حذف دسترسی این کاربر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* بخش سوم: انتقال مالکیت کامل فرم (فقط مخصوص Admin) */}
        {user.roles?.includes('Admin') && (
          <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>انتقال مالکیت کامل فرم (تغییر طراح اصلی)</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              به عنوان مدیر سیستم، می‌توانید طراح و مالکیت کلیه نگارش‌های این فرم را به کاربر ارشد دیگری واگذار کنید. پس از واگذاری، کاربر جدید طراح اصلی فرم خواهد شد.
            </p>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <select
                value={transferUserId}
                onChange={(e) => setTransferUserId(e.target.value)}
                className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {candidates.map(c => (
                  <option key={c.userID} value={c.userID}>
                    {c.displayName || c.username} ({c.username})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleTransferOwnership}
                disabled={transferring || candidates.length === 0}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-sm disabled:opacity-50"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{transferring ? 'در حال انتقال...' : 'انتقال مالکیت کامل فرم'}</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
