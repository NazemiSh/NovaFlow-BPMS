import React, { useState, useMemo, useEffect, useCallback } from 'react';
import api from '../api';
import {
  ArrowRightLeft,
  ArrowLeft,
  Search,
  RefreshCw,
  UserPlus,
  Trash2,
  Users,
  Shield,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  X,
  Eye,
  EyeOff,
  KeyRound,
  XCircle
} from 'lucide-react';
import { toPersianDateTime } from './PersianDatePicker';
import { useDialog } from './GlobalDialogProvider';

export function AdminOversightTab({
  usersList = [],
  forms = [],
  distinctFormTitles = [],
  allPendingTasks = [],
  fetchData
}) {
  const { toast, confirm } = useDialog();
  const [oversightFilterForm, setOversightFilterForm] = useState('ALL');
  const [oversightSearch, setOversightSearch] = useState('');
  const [bulkReassignFromUser, setBulkReassignFromUser] = useState('');
  const [bulkReassignToUser, setBulkReassignToUser] = useState('');

  const activeUsers = useMemo(() => {
    return (usersList || []).filter(u => u.isActive !== false && !u.displayName?.includes('(حذف شده)') && !u.username?.startsWith('[Deleted_'));
  }, [usersList]);

  const formTitles = useMemo(() => {
    if (distinctFormTitles && distinctFormTitles.length > 0) return distinctFormTitles;
    return Array.from(new Set(forms.map(f => f.title).filter(Boolean)));
  }, [distinctFormTitles, forms]);

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">نظارت کلان بر کارتابل‌ها و مدیریت واگذاری وظایف</h3>
            <p className="text-xs text-slate-400 mt-0.5">مشاهده تمام وظایف در جریان سازمان، تغییر مسئول بررسی یا انتقال کلی کارتابل افراد خارج‌شده از سازمان</p>
          </div>
        </div>

        <button onClick={() => fetchData(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer" title="به‌روزرسانی" aria-label="تازه‌سازی نظارت بر کارتابل‌ها">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* پنل انتقال دسته‌جمعی وظایف (Bulk Transfer) */}
      <div className="bg-indigo-50/50 dark:bg-[#232536] p-4 rounded-xl border border-indigo-100 dark:border-slate-700/80 space-y-3">
        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 block">انتقال کلی وظایف (در صورت ترک سازمان یا تغییر شیفت):</span>
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <select
            value={bulkReassignFromUser}
            onChange={(e) => setBulkReassignFromUser(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 flex-1 w-full"
          >
            <option value="">-- انتخاب کاربر مبدا (دارای وظایف باز) --</option>
            {usersList.map(u => <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>)}
          </select>

          <ArrowLeft className="w-4 h-4 text-indigo-400 hidden md:block shrink-0" />

          <select
            value={bulkReassignToUser}
            onChange={(e) => setBulkReassignToUser(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 flex-1 w-full"
          >
            <option value="">-- انتخاب کاربر مقصد (مسئول جدید) --</option>
            {activeUsers.map(u => <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>)}
          </select>

          <button
            type="button"
            disabled={!bulkReassignFromUser || !bulkReassignToUser || bulkReassignFromUser === bulkReassignToUser}
            onClick={async () => {
              const confirmed = await confirm({
                title: 'انتقال کلی وظایف باز',
                message: 'آیا از انتقال کلیه وظایف این کاربر اطمینان دارید؟',
                confirmText: 'تایید و انتقال',
                variant: 'warning'
              });
              if (!confirmed) return;
              try {
                const res = await api.post('/workflow/admin/bulk-reassign', {
                  fromUserId: parseInt(bulkReassignFromUser, 10),
                  toUserId: parseInt(bulkReassignToUser, 10)
                });
                toast.success(res.data.message);
                setBulkReassignFromUser('');
                setBulkReassignToUser('');
                fetchData();
              } catch (err) {
                toast.error('خطا: ' + (err.response?.data?.message || err.message));
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-5 py-2.5 rounded-xl font-bold transition shrink-0 cursor-pointer"
          >
            انتقال کلیه وظایف باز
          </button>
        </div>
      </div>

      {/* نوار فیلتر و جستجوی وظایف */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="جستجو در کد رهگیری یا نام متقاضی..."
            value={oversightSearch}
            onChange={(e) => setOversightSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">فیلتر فرم:</span>
          <select
            value={oversightFilterForm}
            onChange={(e) => setOversightFilterForm(e.target.value)}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-100"
          >
            <option value="ALL">همه فرم‌ها</option>
            {formTitles.map((t, idx) => <option key={idx} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* جدول تمام وظایف در جریان سازمان */}
      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-x-auto shadow-2xs bg-white dark:bg-[#1e2030]">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-3 whitespace-nowrap">کد رهگیری</th>
              <th className="p-3 whitespace-nowrap min-w-[140px]">عنوان فرم</th>
              <th className="p-3 whitespace-nowrap">متقاضی</th>
              <th className="p-3 whitespace-nowrap">تاریخ ثبت</th>
              <th className="p-3 whitespace-nowrap">وضعیت / گام جاری</th>
              <th className="p-3 whitespace-nowrap">مسئول فعلی کارتابل</th>
              <th className="p-3 text-center whitespace-nowrap">واگذاری به فرد دیگر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {allPendingTasks
              .filter(t => {
                const title = t.formTitle || t.FormTitle;
                if (oversightFilterForm !== 'ALL' && title !== oversightFilterForm) return false;
                if (oversightSearch.trim()) {
                  const s = oversightSearch.toLowerCase();
                  const code = (t.trackingCode || '').toLowerCase();
                  const name = (t.submittedByName || '').toLowerCase();
                  return code.includes(s) || name.includes(s);
                }
                return true;
              })
              .map((task) => (
                <tr key={`${task.submissionID || task.submissionId}_${task.currentHandlerUserID || task.currentHandlerUserId || task.currentHandlerName}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap text-right" dir="ltr">{task.trackingCode}</td>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{task.formTitle || task.FormTitle}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{task.submittedByName}</td>
                  <td className="p-3 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap text-right" dir="ltr">{toPersianDateTime(task.submittedAt)}</td>
                  <td className="p-3">
                    {task.workflowStatus?.startsWith('PendingStep_') ? (
                      <div className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 leading-relaxed whitespace-normal text-center">
                        <span className="font-bold">در انتظار تایید</span>
                        <span className="text-[10px] opacity-90 font-medium">
                          {task.workflowStatus.includes(':') ? task.workflowStatus.split(':')[1].trim() : task.workflowStatus}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex flex-col items-center px-2.5 py-1 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 leading-relaxed whitespace-normal text-center">
                        {task.workflowStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {task.currentHandlerName || (task.currentAssignees && task.currentAssignees[0]) || 'کارتابل سازمانی'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <select
                      value=""
                      onChange={async (e) => {
                        const newUid = parseInt(e.target.value, 10);
                        if (!newUid) return;
                        try {
                          await api.post('/workflow/admin/reassign', {
                            submissionId: task.submissionID || task.submissionId,
                            targetFromUserId: task.currentHandlerUserID ?? task.currentHandlerUserId,
                            fromUserId: task.currentHandlerUserID ?? task.currentHandlerUserId,
                            newUserId: newUid
                          });
                          toast.success('وظیفه با موفقیت واگذار شد.');
                          fetchData();
                        } catch (err) {
                          toast.error('خطا: ' + (err.response?.data?.message || err.message));
                        }
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                    >
                      <option value="">-- واگذاری موردی این کارتابل فردی --</option>
                      {activeUsers.map(u => <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>)}
                    </select>
                    <span className="text-[10px] text-slate-400 block mt-1">فقط سهم کارتابل همین فرد به شخص جدید منتقل می‌شود</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

function evaluatePasswordPolicy(password, policy) {
  const pwd = typeof password === 'string' ? password : '';
  const eff = { ...DEFAULT_SECURITY_POLICY, ...(policy || {}) };
  const minLen = eff.enablePasswordPolicy
    ? Math.min(32, Math.max(6, Number(eff.minPasswordLength) || 6))
    : 6;

  const checks = [
    {
      key: 'length',
      label: `حداقل ${minLen} کاراکتر`,
      passed: pwd.length >= minLen && pwd.trim().length >= minLen
    }
  ];

  if (eff.enablePasswordPolicy) {
    if (eff.requireUppercase) {
      checks.push({ key: 'upper', label: 'شامل حرف بزرگ انگلیسی (A-Z)', passed: /[A-Z]/.test(pwd) });
    }
    if (eff.requireLowercase) {
      checks.push({ key: 'lower', label: 'شامل حرف کوچک انگلیسی (a-z)', passed: /[a-z]/.test(pwd) });
    }
    if (eff.requireDigit) {
      checks.push({ key: 'digit', label: 'شامل عدد (0-9)', passed: /[0-9]/.test(pwd) });
    }
    if (eff.requireSpecialChar) {
      checks.push({ key: 'special', label: 'شامل کاراکتر ویژه (!@#$%^&*)', passed: /[^A-Za-z0-9\s]/.test(pwd) });
    }
  }

  return {
    minLen,
    policyEnabled: Boolean(eff.enablePasswordPolicy),
    checks,
    isValid: checks.every((c) => c.passed)
  };
}

export function AdminUsersTab({
  usersList = [],
  fetchData,
  securityPolicy = DEFAULT_SECURITY_POLICY
}) {
  const { toast } = useDialog();
  const [newLocalUser, setNewLocalUser] = useState({ username: '', displayName: '', email: '', password: '', role: 'User' });
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showLocalUserPassword, setShowLocalUserPassword] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('ACTIVE'); // 'ACTIVE' | 'INACTIVE' | 'ALL'
  const [userRoleFilter, setUserRoleFilter] = useState('ALL'); // 'ALL' | 'Admin' | 'SuperUser' | 'User'
  const [userTypeFilter, setUserTypeFilter] = useState('ALL'); // 'ALL' | 'AD' | 'LOCAL'
  const [offboardingModalData, setOffboardingModalData] = useState(null);
  const [offboardingLoading, setOffboardingLoading] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  // وضعیت مودال استاندارد تغییر کلمه عبور
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);

  const handleClosePasswordModal = useCallback(() => {
    if (passwordResetLoading) return;
    setPasswordModalUser(null);
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }, [passwordResetLoading]);

  useEffect(() => {
    if (!passwordModalUser) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !passwordResetLoading) {
        e.preventDefault();
        handleClosePasswordModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [passwordModalUser, passwordResetLoading, handleClosePasswordModal]);

  const resetPwdEval = useMemo(
    () => evaluatePasswordPolicy(newPasswordInput, securityPolicy),
    [newPasswordInput, securityPolicy]
  );
  const localUserPwdEval = useMemo(
    () => evaluatePasswordPolicy(newLocalUser.password, securityPolicy),
    [newLocalUser.password, securityPolicy]
  );
  const MIN_PASSWORD_LENGTH = resetPwdEval.minLen;
  const isNewPasswordLengthValid = resetPwdEval.isValid;
  const hasPasswordMismatch = confirmPasswordInput.length > 0 && newPasswordInput !== confirmPasswordInput;
  const isPasswordMatchValid = confirmPasswordInput.length > 0 && newPasswordInput === confirmPasswordInput;
  const canSubmitPasswordReset = isNewPasswordLengthValid && isPasswordMatchValid && !passwordResetLoading;

  const offboardingTaskCandidates = useMemo(() => {
    if (!offboardingModalData?.user) return [];
    const targetId = offboardingModalData.user.userID;
    return (usersList || []).filter(u =>
      u.isActive !== false &&
      u.userID !== targetId &&
      !u.displayName?.includes('(حذف شده)') &&
      !u.username?.startsWith('[Deleted_')
    );
  }, [usersList, offboardingModalData]);

  const offboardingFormCandidates = useMemo(() => {
    if (!offboardingModalData?.user) return [];
    const targetId = offboardingModalData.user.userID;
    return (usersList || []).filter(u =>
      u.isActive !== false &&
      u.userID !== targetId &&
      (u.roles?.includes('Admin') || u.roles?.includes('SuperUser')) &&
      !u.displayName?.includes('(حذف شده)') &&
      !u.username?.startsWith('[Deleted_')
    );
  }, [usersList, offboardingModalData]);

  const handleAssignRole = async (targetUser, newRole) => {
    try {
      await api.post(`/users/${targetUser.userID}/roles`, [newRole]);
      toast.success(`نقش کاربر ${targetUser.displayName || targetUser.username} به ${newRole} تغییر یافت.`);
      fetchData();
    } catch (err) {
      toast.error('خطا در انتساب نقش: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleOpenResetPasswordModal = (targetUser) => {
    setPasswordModalUser(targetUser);
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmitResetPassword = async (e) => {
    e.preventDefault();
    if (!passwordModalUser || !canSubmitPasswordReset) return;
    try {
      setPasswordResetLoading(true);
      const res = await api.post(`/users/${passwordModalUser.userID}/reset-password`, {
        newPassword: newPasswordInput
      });
      toast.success(res.data.message || 'کلمه عبور با موفقیت بازنشانی شد.');
      setPasswordModalUser(null);
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    } catch (err) {
      toast.error('خطا در ریست پسورد: ' + (err.response?.data?.message || err.message));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleToggleUserActive = async (targetUser) => {
    if (targetUser.isActive) {
      let summary = { pendingTasksCount: 0, ownedFormsCount: 0 };
      try {
        const summaryRes = await api.get(`/users/${targetUser.userID}/offboarding-summary`);
        if (summaryRes.data) {
          summary = summaryRes.data;
        }
      } catch (err) {
        console.warn('Could not fetch offboarding summary:', err);
      }

      setOffboardingModalData({
        user: targetUser,
        summary,
        targetTaskUserId: '',
        targetFormUserId: ''
      });
      return;
    }

    try {
      const res = await api.post(`/users/${targetUser.userID}/toggle-active`, {});
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      if (err.response?.data?.requiresOffboarding) {
        setOffboardingModalData({
          user: targetUser,
          summary: err.response.data,
          targetTaskUserId: '',
          targetFormUserId: ''
        });
      } else {
        toast.error(err.response?.data?.message || 'خطا در تغییر وضعیت کاربر.');
      }
    }
  };

  const handleConfirmOffboarding = async () => {
    if (!offboardingModalData?.user) return;
    const { user, summary, targetTaskUserId, targetFormUserId } = offboardingModalData;

    if (summary.pendingTasksCount > 0 && !targetTaskUserId) {
      toast.warning('لطفاً کاربر جایگزین را برای تحویل وظایف باز کارتابل انتخاب کنید.');
      return;
    }

    if (summary.ownedFormsCount > 0 && !targetFormUserId) {
      toast.warning('لطفاً کاربر ارشد جایگزین را برای انتقال مالکیت فرم‌ها انتخاب کنید.');
      return;
    }

    try {
      setOffboardingLoading(true);
      const payload = {};
      if (summary.pendingTasksCount > 0) {
        payload.transferTasksToUserId = Number(targetTaskUserId);
      }
      if (summary.ownedFormsCount > 0) {
        payload.transferFormsToUserId = Number(targetFormUserId);
      }

      const res = await api.post(`/users/${user.userID}/toggle-active`, payload);
      toast.success(res.data.message || 'حساب کاربری با موفقیت غیرفعال شد.');
      setOffboardingModalData(null);
      fetchData();
    } catch (err) {
      toast.error('خطا در غیرفعال‌سازی کاربر: ' + (err.response?.data?.message || err.message));
    } finally {
      setOffboardingLoading(false);
    }
  };

  const handleUnlockUser = async (targetUser) => {
    try {
      const res = await api.post(`/users/${targetUser.userID}/unlock`);
      toast.success(res.data?.message || 'قفل حساب کاربری با موفقیت باز شد.');
      fetchData();
    } catch (err) {
      toast.error('خطا در باز کردن قفل حساب: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteUser = (targetUser) => {
    setDeleteConfirmUser(targetUser);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    try {
      setDeleteUserLoading(true);
      const res = await api.delete(`/users/${deleteConfirmUser.userID}`);
      toast.success(res.data.message);
      setDeleteConfirmUser(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف کاربر.');
    } finally {
      setDeleteUserLoading(false);
    }
  };

  const handleCreateLocalUser = async (e) => {
    e.preventDefault();
    if (!newLocalUser.username.trim() || !newLocalUser.displayName.trim() || !newLocalUser.password.trim()) {
      toast.warning('کد کاربری، نام و نام خانوادگی و کلمه عبور الزامی هستند.');
      return;
    }
    if (!localUserPwdEval.isValid) {
      const failedLabels = localUserPwdEval.checks.filter((c) => !c.passed).map((c) => c.label);
      toast.warning(`کلمه عبور با سیاست امنیتی سامانه مطابقت ندارد: ${failedLabels.join('، ')}`);
      return;
    }
    try {
      await api.post('/users/local', newLocalUser);
      toast.success('کاربر محلی جدید با موفقیت اضافه شد.');
      setShowAddUserModal(false);
      setShowLocalUserPassword(false);
      setNewLocalUser({ username: '', displayName: '', email: '', password: '', role: 'User' });
      fetchData();
    } catch (err) {
      toast.error('خطا در ثبت کاربر: ' + (err.response?.data?.message || err.message));
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const isDomain = Boolean(u.isActiveDirectoryUser || u.isDomainUser || u.username?.includes('@'));
    const isActive = u.isActive !== false;

    if (userStatusFilter === 'ACTIVE' && !isActive) return false;
    if (userStatusFilter === 'INACTIVE' && isActive) return false;

    if (userTypeFilter === 'AD' && !isDomain) return false;
    if (userTypeFilter === 'LOCAL' && isDomain) return false;

    if (userRoleFilter !== 'ALL') {
      const roles = u.roles || [];
      if (userRoleFilter === 'User') {
        const isNormalUser = roles.includes('User') || (!roles.includes('Admin') && !roles.includes('SuperUser'));
        if (!isNormalUser) return false;
      } else if (!roles.includes(userRoleFilter)) {
        return false;
      }
    }

    if (userSearchTerm.trim()) {
      const q = userSearchTerm.trim().toLowerCase();
      const matchName = (u.displayName || '').toLowerCase().includes(q);
      const matchUser = (u.username || '').toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      if (!matchName && !matchUser && !matchEmail) return false;
    }

    return true;
  });

  const hasActiveFilters = userSearchTerm.trim() !== '' || userStatusFilter !== 'ACTIVE' || userRoleFilter !== 'ALL' || userTypeFilter !== 'ALL';

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">مدیریت کاربران و انتساب نقش‌ها</h3>
            <p className="text-xs text-slate-400 mt-0.5">کاربران احراز هویت‌شده دامین Active Directory و حساب‌های محلی سامانه</p>
          </div>
        </div>
        <button
          onClick={() => {
            setShowLocalUserPassword(false);
            setShowAddUserModal(true);
          }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold transition shadow-sm cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>افزودن کاربر محلی جدید</span>
        </button>
      </div>

      {showAddUserModal && (
        <div className="border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-[#1e2030] p-5 rounded-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-slate-700">
            <span className="font-bold text-sm text-blue-900 dark:text-blue-300">تعریف کاربر محلی جدید (Local Account)</span>
            <button
              type="button"
              onClick={() => {
                setShowAddUserModal(false);
                setShowLocalUserPassword(false);
              }}
              aria-label="بستن فرم افزودن کاربر"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreateLocalUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">کد کاربری / نام کاربری (Username) *</label>
              <input
                type="text"
                required
                value={newLocalUser.username}
                onChange={(e) => setNewLocalUser({ ...newLocalUser, username: e.target.value })}
                placeholder="مثلاً: 10452 یا user_local"
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام و نام خانوادگی *</label>
              <input
                type="text"
                required
                value={newLocalUser.displayName}
                onChange={(e) => setNewLocalUser({ ...newLocalUser, displayName: e.target.value })}
                placeholder="مثلاً: احمد رضایی"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">آدرس ایمیل</label>
              <input
                type="email"
                dir="ltr"
                value={newLocalUser.email}
                onChange={(e) => setNewLocalUser({ ...newLocalUser, email: e.target.value })}
                placeholder="user@company.local"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">کلمه عبور ورود *</label>
              <div className="relative">
                <input
                  type={showLocalUserPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={newLocalUser.password}
                  onChange={(e) => setNewLocalUser({ ...newLocalUser, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pl-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowLocalUserPassword((prev) => !prev)}
                  title={showLocalUserPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                  aria-label={showLocalUserPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
                >
                  {showLocalUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-1.5 space-y-1">
                {localUserPwdEval.checks.map((chk) => (
                  <div
                    key={chk.key}
                    className={`text-[11px] flex items-center gap-1.5 ${
                      newLocalUser.password.length === 0
                        ? 'text-slate-400 dark:text-slate-400'
                        : chk.passed
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-amber-600 dark:text-amber-400 font-medium'
                    }`}
                  >
                    {newLocalUser.password.length === 0 ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                    ) : chk.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{chk.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">نقش و سطح دسترسی کاربر در سامانه:</label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="userRole"
                    checked={newLocalUser.role === 'User'}
                    onChange={() => setNewLocalUser({ ...newLocalUser, role: 'User' })}
                    className="text-indigo-600"
                  />
                  <span>کاربر عادی (User)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="userRole"
                    checked={newLocalUser.role === 'SuperUser'}
                    onChange={() => setNewLocalUser({ ...newLocalUser, role: 'SuperUser' })}
                    className="text-indigo-600"
                  />
                  <span>کاربر ارشد / طراح فرآیند (SuperUser)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="userRole"
                    checked={newLocalUser.role === 'Admin'}
                    onChange={() => setNewLocalUser({ ...newLocalUser, role: 'Admin' })}
                    className="text-indigo-600"
                  />
                  <span className="font-bold text-indigo-700 dark:text-indigo-400">مدیر کلان سیستم (Admin)</span>
                </label>
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddUserModal(false);
                  setShowLocalUserPassword(false);
                }}
                className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-5 py-2 rounded-xl font-bold cursor-pointer"
              >
                ثبت کاربر محلی
              </button>
            </div>
          </form>
        </div>
      )}

      {/* نوار جستجو و فیلتر کاربران */}
      <div className="bg-slate-50 dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearchTerm}
              onChange={(e) => setUserSearchTerm(e.target.value)}
              placeholder="جستجو نام، کد کاربری یا ایمیل..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ACTIVE">وضعیت: فقط اکانت‌های فعال</option>
              <option value="INACTIVE">وضعیت: فقط اکانت‌های غیرفعال</option>
              <option value="ALL">وضعیت: همه کاربران (فعال و غیرفعال)</option>
            </select>
          </div>

          <div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">نقش: همه نقش‌ها</option>
              <option value="Admin">مدیر سیستم (Admin)</option>
              <option value="SuperUser">کاربر ارشد (SuperUser)</option>
              <option value="User">کاربر عادی (User)</option>
            </select>
          </div>

          <div>
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">نوع اکانت: همه (دامین و محلی)</option>
              <option value="AD">فقط Active Directory</option>
              <option value="LOCAL">فقط محلی (Local)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
          <span>
            نمایش <b>{filteredUsers.length}</b> کاربر از مجموع <b>{usersList.length}</b> کاربر ثبت‌شده
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setUserSearchTerm('');
                setUserStatusFilter('ACTIVE');
                setUserRoleFilter('ALL');
                setUserTypeFilter('ALL');
              }}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
            >
              بازنشانی فیلترها به حالت پیش‌فرض
            </button>
          )}
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-x-auto overflow-y-visible md:overflow-y-auto max-h-none md:max-h-[580px] shadow-2xs bg-white dark:bg-[#1e2030]">
        <table className="w-full text-right text-xs border-collapse">
          <thead className="bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 shadow-2xs">
            <tr>
              <th className="p-3 whitespace-nowrap">نام کاربر</th>
              <th className="p-3 whitespace-nowrap">کد / نام کاربری</th>
              <th className="p-3 whitespace-nowrap">آدرس ایمیل</th>
              <th className="p-3 whitespace-nowrap">نوع اکانت</th>
              <th className="p-3 whitespace-nowrap">نقش‌های فعلی</th>
              <th className="p-3 text-center whitespace-nowrap">تغییر سطح دسترسی</th>
              <th className="p-3 text-center whitespace-nowrap">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  هیچ کاربری با فیلترهای انتخاب‌شده یافت نشد.
                </td>
              </tr>
            ) : filteredUsers.map((u) => {
              const isDomain = Boolean(u.isActiveDirectoryUser || u.isDomainUser || u.username?.includes('@'));
              const isSuperAdmin = u.username?.toLowerCase() === 'local_admin';
              const hasAdmin = u.roles?.includes('Admin');
              const hasSuperUser = u.roles?.includes('SuperUser');

              return (
                <tr key={u.userID} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${!u.isActive ? 'opacity-50 bg-slate-50/50 dark:bg-slate-900/40' : ''}`}>
                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{u.displayName || u.username}</span>
                      {!u.isActive && <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">(غیرفعال)</span>}
                      {u.isLocked && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 whitespace-nowrap">
                          قفل‌شده
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-slate-600 dark:text-slate-300 text-[11px] whitespace-nowrap text-right" dir="ltr">{u.username}</td>
                  <td className="p-3 font-mono text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap text-right" dir="ltr">{u.email || '—'}</td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`inline-block text-center px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${
                      isDomain ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}>
                      {isDomain ? 'Active Directory' : 'محلی / Local'}
                    </span>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex gap-1 flex-nowrap">
                      {u.roles?.map((r, i) => (
                        <span key={i} className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                          r === 'Admin' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                          r === 'SuperUser' ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {r === 'Admin' ? 'مدیر سیستم' : r === 'SuperUser' ? 'کاربر ارشد' : 'کاربر عادی'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <select
                      value={hasAdmin ? 'Admin' : hasSuperUser ? 'SuperUser' : 'User'}
                      onChange={(e) => handleAssignRole(u, e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100"
                    >
                      <option value="User">کاربر عادی (User)</option>
                      <option value="SuperUser">کاربر ارشد (SuperUser)</option>
                      <option value="Admin">مدیر سیستم (Admin)</option>
                    </select>
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      {u.isLocked && (
                        <button
                          type="button"
                          onClick={() => handleUnlockUser(u)}
                          className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-lg transition shadow-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          title={`باز کردن قفل حساب کاربری (Unlock)${u.accessFailedCount ? ` - تلاش‌های ناموفق: ${u.accessFailedCount}` : ''}`}
                        >
                          <Unlock className="w-3.5 h-3.5 shrink-0" />
                          <span>باز کردن قفل (Unlock)</span>
                        </button>
                      )}

                      {!isDomain && (
                        <button
                          type="button"
                          onClick={() => handleOpenResetPasswordModal(u)}
                          className="text-[11px] text-amber-700 dark:text-amber-300 hover:text-amber-800 bg-amber-50 dark:bg-amber-500/15 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-200 dark:border-amber-500/30 px-2 py-1 rounded-lg transition whitespace-nowrap cursor-pointer"
                          title="تغییر کلمه عبور"
                        >
                          تغییر رمز
                        </button>
                      )}

                      {!isSuperAdmin && (
                        <>
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className={`text-[11px] px-2 py-1 rounded-lg border transition whitespace-nowrap cursor-pointer ${
                              u.isActive ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-700' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/30'
                            }`}
                            title={u.isActive ? 'غیرفعال‌سازی موقت کاربر' : 'فعال‌سازی مجدد کاربر'}
                          >
                            {u.isActive ? 'غیرفعال' : 'فعال'}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-[11px] text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-500/30 p-1 rounded-lg transition whitespace-nowrap cursor-pointer"
                            title="حذف کامل کاربر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* مودال تعیین تکلیف کارتابل و فرم‌ها پیش از غیرفعال‌سازی (User Offboarding) */}
      {offboardingModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#1b1e2e] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col text-right">
            {/* سربرگ مودال */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-amber-500/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-md shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                    تعیین تکلیف کارتابل و فرم‌ها پیش از غیرفعال‌سازی
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    کاربر: <span className="font-bold text-slate-700 dark:text-slate-200">{offboardingModalData.user.displayName || offboardingModalData.user.username}</span> ({offboardingModalData.user.username})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={offboardingLoading}
                onClick={() => setOffboardingModalData(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* بدنه مودال */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                {offboardingModalData.summary.pendingTasksCount > 0 || offboardingModalData.summary.ownedFormsCount > 0
                  ? 'برای حفظ یکپارچگی فرآیندهای سازمانی و جلوگیری از توقف گردش اسناد، پیش از غیرفعال‌سازی این کاربر، ضروری است وظایف جاری کارتابل و مالکیت فرم‌های وی تعیین تکلیف و به سایر همکاران فعال واگذار گردد.'
                  : 'این کاربر در حال حاضر هیچ وظیفه باز یا فرم تحت مالکیتی ندارد. در صورت تایید، حساب کاربری به صورت موقت غیرفعال خواهد شد و امکان فعال‌سازی مجدد آن در هر زمان وجود دارد.'}
              </div>

              {/* بخش کارتابل و وظایف در انتظار اقدام */}
              {offboardingModalData.summary.pendingTasksCount > 0 ? (
                <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-900 dark:text-blue-200 flex items-center gap-2">
                      <ArrowRightLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      وظایف باز در کارتابل
                    </span>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {offboardingModalData.summary.pendingTasksCount} وظیفه در انتظار اقدام
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      انتخاب کاربر جایگزین برای تحویل وظایف کارتابل <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={offboardingModalData.targetTaskUserId}
                      onChange={(e) => setOffboardingModalData(prev => ({ ...prev, targetTaskUserId: e.target.value }))}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151722] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- لطفاً کاربر جایگزین کارتابل را انتخاب کنید --</option>
                      {offboardingTaskCandidates.map(u => (
                        <option key={u.userID} value={u.userID}>
                          {u.displayName || u.username} ({u.username})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  این کاربر هیچ وظیفه باز یا در انتظاری در کارتابل سازمانی ندارد.
                </div>
              )}

              {/* بخش فرم‌های تحت مالکیت */}
              {offboardingModalData.summary.ownedFormsCount > 0 ? (
                <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      مالکیت فرم‌های سازمانی
                    </span>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                      {offboardingModalData.summary.ownedFormsCount} فرم طراحی‌شده
                    </span>
                  </div>

                  {/* عناوین فرم‌ها */}
                  {offboardingModalData.summary.ownedFormTitles?.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-white/80 dark:bg-[#151722] border border-indigo-100 dark:border-indigo-900/30 max-h-28 overflow-y-auto">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">فرم‌های تحت مالکیت این کاربر:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {offboardingModalData.summary.ownedFormTitles.map((title, idx) => (
                          <span key={idx} className="px-2 py-0.5 text-[11px] rounded-lg bg-indigo-100/70 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-medium">
                            {title}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      انتخاب کاربر ارشد / مدیر جایگزین برای انتقال مالکیت فرم‌ها <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={offboardingModalData.targetFormUserId}
                      onChange={(e) => setOffboardingModalData(prev => ({ ...prev, targetFormUserId: e.target.value }))}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#151722] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- لطفاً کاربر ارشد (SuperUser) یا مدیر جایگزین را انتخاب کنید --</option>
                      {offboardingFormCandidates.map(u => (
                        <option key={u.userID} value={u.userID}>
                          {u.displayName || u.username} ({u.roles?.includes('Admin') ? 'مدیر سیستم' : 'کاربر ارشد'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  این کاربر طراح هیچ فرم سازمانی نیست.
                </div>
              )}
            </div>

            {/* پابرگ مودال */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#151722] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={offboardingLoading}
                onClick={() => setOffboardingModalData(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={offboardingLoading}
                onClick={handleConfirmOffboarding}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-md transition cursor-pointer"
              >
                {offboardingLoading ? (
                  <span>در حال پردازش و غیرفعال‌سازی...</span>
                ) : (offboardingModalData.summary.pendingTasksCount > 0 || offboardingModalData.summary.ownedFormsCount > 0) ? (
                  <span>تایید انتقال و غیرفعال‌سازی حساب</span>
                ) : (
                  <span>تایید غیرفعال‌سازی حساب کاربری</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال تاییدیه اختصاصی حذف کامل کاربر */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#1b1e2e] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col text-right">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-rose-500/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">حذف حساب کاربری</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {deleteConfirmUser.displayName || deleteConfirmUser.username} ({deleteConfirmUser.username})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleteUserLoading}
                onClick={() => setDeleteConfirmUser(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              آیا از حذف کامل حساب کاربری <b className="text-slate-800 dark:text-slate-100">«{deleteConfirmUser.displayName || deleteConfirmUser.username}»</b> اطمینان دارید؟ در صورت وجود سوابق تاریخی، اطلاعات ثبت‌شده برای گزارش‌گیری حفظ می‌شوند.
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#151722] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleteUserLoading}
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={deleteUserLoading}
                onClick={handleConfirmDeleteUser}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition cursor-pointer"
              >
                {deleteUserLoading ? 'در حال حذف...' : 'تایید و حذف کاربر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال استاندارد تغییر کلمه عبور با دو فیلد و آیکن چشم */}
      {passwordModalUser && (
        <div
          onClick={handleClosePasswordModal}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="bpms-reset-password-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#1b1e2e] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col text-right"
          >
            {/* هدر مودال تغییر کلمه عبور */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-amber-500/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="bpms-reset-password-title" className="font-bold text-base text-slate-800 dark:text-slate-100">
                    تغییر کلمه عبور کاربر
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {passwordModalUser.displayName || passwordModalUser.username}
                    </span>{' '}
                    (<span dir="ltr" className="font-mono">{passwordModalUser.username}</span>)
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={passwordResetLoading}
                onClick={handleClosePasswordModal}
                aria-label="بستن مودال تغییر کلمه عبور"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* فرم دو فیلدی تغییر کلمه عبور */}
            <form onSubmit={handleSubmitResetPassword}>
              <div className="p-5 sm:p-6 space-y-4">
                {/* فیلد اول: کلمه عبور جدید */}
                <div>
                  <label
                    htmlFor="bpms-new-password-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    کلمه عبور جدید <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="bpms-new-password-input"
                      type={showNewPassword ? 'text' : 'password'}
                      dir="ltr"
                      autoFocus
                      autoComplete="new-password"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pl-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs sm:text-sm bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      title={showNewPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                      aria-label={showNewPassword ? 'مخفی‌سازی رمز عبور' : 'نمایش رمز عبور'}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* راهنما و اعتبارسنجی لحظه‌ای سیاست کلمه عبور */}
                  <div className="mt-2 space-y-1">
                    {resetPwdEval.checks.map((chk) => (
                      <div
                        key={chk.key}
                        className={`text-[11px] flex items-center gap-1.5 ${
                          newPasswordInput.length === 0
                            ? 'text-slate-400 dark:text-slate-400'
                            : chk.passed
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'text-amber-600 dark:text-amber-400 font-medium'
                        }`}
                      >
                        {newPasswordInput.length === 0 ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                        ) : chk.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{chk.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* فیلد دوم: تکرار کلمه عبور جدید */}
                <div>
                  <label
                    htmlFor="bpms-confirm-password-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    تکرار کلمه عبور جدید <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="bpms-confirm-password-input"
                      type={showConfirmPassword ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="new-password"
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full px-3.5 py-2.5 pl-10 rounded-xl border text-xs sm:text-sm bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 text-left font-mono ${
                        hasPasswordMismatch
                          ? 'border-rose-400 dark:border-rose-500 focus:ring-rose-500'
                          : isPasswordMatchValid
                          ? 'border-emerald-400 dark:border-emerald-500 focus:ring-emerald-500'
                          : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      title={showConfirmPassword ? 'مخفی‌سازی تکرار رمز عبور' : 'نمایش تکرار رمز عبور'}
                      aria-label={showConfirmPassword ? 'مخفی‌سازی تکرار رمز عبور' : 'نمایش تکرار رمز عبور'}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* پیام خطای عدم تطابق یا تایید تطابق */}
                  {hasPasswordMismatch && (
                    <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>کلمه عبور و تکرار آن یکسان نیستند</span>
                    </p>
                  )}
                  {!hasPasswordMismatch && isPasswordMatchValid && isNewPasswordLengthValid && (
                    <p className="mt-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>کلمه عبور و تکرار آن با یکدیگر مطابقت دارند.</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#151722] flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={passwordResetLoading}
                  onClick={handleClosePasswordModal}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitPasswordReset}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition cursor-pointer"
                >
                  {passwordResetLoading ? 'در حال ثبت...' : 'ثبت کلمه عبور جدید'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminGroupsTab({
  groups = [],
  usersList = [],
  fetchData,
  adSettings = {}
}) {
  const { toast, confirm } = useDialog();
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedGroupIdForMembers, setSelectedGroupIdForMembers] = useState(null);
  const [userToAddGroup, setUserToAddGroup] = useState('');
  const [adSyncModalOpen, setAdSyncModalOpen] = useState(false);
  const [adSyncCreds, setAdSyncCreds] = useState({ serviceUser: '', servicePassword: '', filter: '' });
  const [adPreviewGroups, setAdPreviewGroups] = useState([]);
  const [selectedAdGroupDns, setSelectedAdGroupDns] = useState([]);
  const [adSyncLoading, setAdSyncLoading] = useState(false);

  const handleDeleteGroup = async (group) => {
    const confirmed = await confirm({
      title: 'حذف گروه سازمانی',
      message: `آیا از حذف گروه «${group.groupName}» اطمینان دارید؟`,
      confirmText: 'تایید و حذف گروه',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await api.delete(`/groups/${group.groupID || group.groupId}`);
      toast.success(res.data.message);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف گروه.');
    }
  };

  return (
    <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700/80">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">مدیریت گروه‌های سازمانی و انتساب اعضا</h3>
            <p className="text-xs text-slate-400 mt-0.5">تعریف واحدهای سازمانی و تخصیص کاربران جهت کنترل دسترسی به فرم‌ها و کارتابل‌ها</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setAdSyncCreds({
              serviceUser: adSettings.serviceUser || '',
              servicePassword: '',
              filter: ''
            });
            setAdPreviewGroups([]);
            setSelectedAdGroupDns([]);
            setAdSyncModalOpen(true);
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold transition shadow-sm shrink-0 cursor-pointer"
        >
          <Users className="w-4 h-4" />
          <span>همگام‌سازی گروه‌های Active Directory</span>
        </button>
      </div>

      {adSyncModalOpen && (
        <div className="border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-[#1e2030] p-5 rounded-2xl space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-slate-700">
            <span className="font-bold text-sm text-blue-900 dark:text-blue-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>دریافت و همگام‌سازی گروه‌ها و نفرات از Active Directory ({adSettings.domainName})</span>
            </span>
            <button onClick={() => setAdSyncModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">✕</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">نام کاربری دامین (Domain User):</label>
              <input
                type="text"
                dir="ltr"
                value={adSyncCreds.serviceUser}
                onChange={(e) => setAdSyncCreds({ ...adSyncCreds, serviceUser: e.target.value })}
                placeholder={`user@${adSettings.domainName}`}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">کلمه عبور دامین (Password):</label>
              <input
                type="password"
                dir="ltr"
                value={adSyncCreds.servicePassword}
                onChange={(e) => setAdSyncCreds({ ...adSyncCreds, servicePassword: e.target.value })}
                placeholder="کلمه عبور اکانت دامین..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 font-mono text-left"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">فیلتر نام گروه (اختیاری):</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adSyncCreds.filter}
                  onChange={(e) => setAdSyncCreds({ ...adSyncCreds, filter: e.target.value })}
                  placeholder="مثلاً: IT یا Finance..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={adSyncLoading || !adSyncCreds.serviceUser || !adSyncCreds.servicePassword}
                  onClick={async () => {
                    setAdSyncLoading(true);
                    try {
                      const res = await api.post('/groups/ad-preview', adSyncCreds);
                      setAdPreviewGroups(res.data.groups || []);
                      if ((res.data.groups || []).length === 0) {
                        toast.warning('گروهی با این مشخصات در Active Directory یافت نشد.');
                      }
                    } catch (err) {
                      toast.error(err.response?.data?.message || 'خطا در دریافت گروه‌های اکتیو دایرکتوری');
                    } finally {
                      setAdSyncLoading(false);
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-4 py-2 rounded-xl font-bold shrink-0 cursor-pointer"
                >
                  {adSyncLoading ? 'در حال جستجو...' : 'جستجو'}
                </button>
              </div>
            </div>
          </div>

          {adPreviewGroups.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                گروه‌های یافت‌شده در اکتیو دایرکتوری ({adPreviewGroups.length} گروه) — گروه‌های مورد نظر را انتخاب کنید:
              </div>
              <div className="max-h-64 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-2.5 pr-1">
                {adPreviewGroups.map((ag) => {
                  const checked = selectedAdGroupDns.includes(ag.distinguishedName);
                  return (
                    <div
                      key={ag.distinguishedName}
                      onClick={() => {
                        setSelectedAdGroupDns(
                          checked
                            ? selectedAdGroupDns.filter(d => d !== ag.distinguishedName)
                            : [...selectedAdGroupDns, ag.distinguishedName]
                        );
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition space-y-1.5 ${
                        checked ? 'bg-blue-100/70 dark:bg-blue-900/30 border-blue-500' : 'bg-white dark:bg-[#252736] border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 font-bold text-xs text-slate-800 dark:text-slate-100 cursor-pointer">
                          <input type="checkbox" checked={checked} onChange={() => {}} className="rounded text-blue-600" />
                          <span>{ag.groupName}</span>
                        </label>
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-mono">
                          {ag.members?.length || 0} نفر
                        </span>
                      </div>
                      {ag.description && <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{ag.description}</div>}
                      {ag.members && ag.members.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {ag.members.slice(0, 6).map((m, idx) => (
                            <span key={idx} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                              {m.displayName || m.username}
                            </span>
                          ))}
                          {ag.members.length > 6 && (
                            <span className="text-[10px] text-slate-400">+{ag.members.length - 6} نفر دیگر</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-blue-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setAdSyncModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  بستن
                </button>
                <button
                  type="button"
                  disabled={selectedAdGroupDns.length === 0 || adSyncLoading}
                  onClick={async () => {
                    setAdSyncLoading(true);
                    try {
                      const chosen = adPreviewGroups.filter(g => selectedAdGroupDns.includes(g.distinguishedName));
                      const res = await api.post('/groups/ad-import', chosen);
                      toast.success(res.data.message || 'گروه‌ها و اعضای آن‌ها با موفقیت همگام‌سازی شدند.');
                      setAdSyncModalOpen(false);
                      fetchData();
                    } catch (err) {
                      toast.error(err.response?.data?.message || 'خطا در ثبت گروه‌های AD');
                    } finally {
                      setAdSyncLoading(false);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-5 py-2 rounded-xl font-bold shadow-sm cursor-pointer"
                >
                  افزودن / همگام‌سازی {selectedAdGroupDns.length} گروه انتخاب‌شده با اعضا
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!newGroupName.trim()) return;
        try {
          await api.post('/groups', { groupName: newGroupName, description: newGroupDesc });
          setNewGroupName('');
          setNewGroupDesc('');
          toast.success('گروه سازمانی جدید با موفقیت افزوده شد.');
          fetchData();
        } catch (err) {
          toast.error('خطا: ' + (err.response?.data?.message || err.message));
        }
      }} className="bg-slate-50 dark:bg-[#1e2030] border border-slate-200/80 dark:border-slate-700/80 p-4 rounded-xl flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          placeholder="نام گروه (مثلاً: تیم مالی، سرپرستان شیفت، منابع انسانی)"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm flex-1 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
        />
        <input
          type="text"
          placeholder="توضیحات و دامنه وظایف (اختیاری)"
          value={newGroupDesc}
          onChange={(e) => setNewGroupDesc(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm flex-1 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-1.5 cursor-pointer shrink-0">
          <Plus className="w-3.5 h-3.5" />
          <span>ایجاد گروه</span>
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[620px] overflow-y-auto pr-1">
        {groups.map((g) => {
          const gId = g.groupID || g.groupId;
          const isSelected = selectedGroupIdForMembers === gId;

          return (
            <div key={gId} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-[#1e2030] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{g.groupName}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-mono">
                    کد: {gId}
                  </span>
                  <button onClick={() => handleDeleteGroup(g)} className="text-slate-400 hover:text-rose-600 p-1 rounded-md cursor-pointer" title="حذف گروه">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-xs text-slate-400">{g.description || 'بدون توضیحات تکمیلی'}</div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">تعداد اعضا: <b>{g.members?.length || 0} نفر</b></span>
                <button
                  type="button"
                  onClick={() => setSelectedGroupIdForMembers(isSelected ? null : gId)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  {isSelected ? 'بستن اعضا' : 'مدیریت اعضای گروه'}
                </button>
              </div>

              {isSelected && (
                <div className="pt-3 border-t border-indigo-100 dark:border-slate-700 bg-indigo-50/30 dark:bg-[#1e2030] p-3 rounded-xl space-y-3">
                  <div className="flex gap-2">
                    <select
                      value={userToAddGroup}
                      onChange={(e) => setUserToAddGroup(e.target.value)}
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                    >
                      <option value="">-- انتخاب کاربر جهت عضویت --</option>
                      {usersList.filter(u => u.isActive === true).map(u => (
                        <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!userToAddGroup) return;
                        try {
                          await api.post(`/groups/${gId}/members`, { userId: parseInt(userToAddGroup, 10) });
                          toast.success('کاربر با موفقیت به گروه افزوده شد.');
                          setUserToAddGroup('');
                          fetchData();
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'خطا در افزودن کاربر به گروه.');
                        }
                      }}
                      className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold"
                    >
                      افزودن
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {g.members?.map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-white dark:bg-[#252736] border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-md text-[11px] text-slate-700 dark:text-slate-200">
                        <span>{m.displayName || m.username}</span>
                        <button
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: 'حذف عضو از گروه',
                              message: `آیا از حذف «${m.displayName || m.username}» از گروه «${g.groupName}» اطمینان دارید؟`,
                              confirmText: 'حذف عضو',
                              variant: 'danger'
                            });
                            if (!confirmed) return;
                            try {
                              await api.delete(`/groups/${gId}/members/${m.userID || m.userId}`);
                              toast.success('کاربر از گروه حذف شد.');
                              fetchData();
                            } catch (e) {
                              toast.error(e.response?.data?.message || e.message);
                            }
                          }}
                          className="text-slate-400 hover:text-rose-600 text-xs"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {(!g.members || g.members.length === 0) && (
                      <span className="text-[11px] text-slate-400">هنوز کاربری عضو این گروه نیست.</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminManagementTabs({
  activeTab,
  user,
  usersList = [],
  groups = [],
  forms = [],
  distinctFormTitles = [],
  allPendingTasks = [],
  fetchData,
  adSettings = {},
  securityPolicy = DEFAULT_SECURITY_POLICY
}) {
  if (activeTab === 'oversight') {
    return (
      <AdminOversightTab
        usersList={usersList}
        forms={forms}
        distinctFormTitles={distinctFormTitles}
        allPendingTasks={allPendingTasks}
        fetchData={fetchData}
      />
    );
  }

  if (activeTab === 'users-management') {
    return (
      <AdminUsersTab
        usersList={usersList}
        fetchData={fetchData}
        securityPolicy={securityPolicy}
      />
    );
  }

  if (activeTab === 'groups-management') {
    return (
      <AdminGroupsTab
        groups={groups}
        usersList={usersList}
        fetchData={fetchData}
        adSettings={adSettings}
      />
    );
  }

  return null;
}
