import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import api from './api';
import AiStudioTab from './components/AiStudioTab';
import CartableTabs from './components/CartableTabs';
import LicenseLockScreen from './components/LicenseLockScreen';
import MobileBarcodeScannerModal from './components/MobileBarcodeScannerModal';
import PersianDatePicker, {
  toPersianDateTime,
  toPersianDateOnly,
  toPersianTimeOnly,
  getTodayJalaliStr,
  buildIsoFromJalaliAndTime,
  isPublicSurveyClosed
} from './components/PersianDatePicker';
import FormViewer from './components/FormViewer';
import FormsCatalogTab from './components/FormsCatalogTab';
import FormBuilderTab from './components/FormBuilderTab';
import ReportsTab from './components/ReportsTab';
import AdminManagementTabs from './components/AdminManagementTabs';
import SystemSettingsTab from './components/SystemSettingsTab';
import BackupRestoreTab from './components/BackupRestoreTab';
import MasterDataHubTab from './components/MasterDataHubTab';
import LoginPage from './components/LoginPage';
import PublicSurveyPage from './components/PublicSurveyPage';
import DynamicFormRenderer, { ValidationRulesAlert } from './components/DynamicFormRenderer';
import AttachmentFolderPage from './components/AttachmentFolderPage';
import ErrorBoundary from './components/ErrorBoundary';
import { GlobalDialogProvider, useDialog } from './components/GlobalDialogProvider';
import { isSafeInternalPath } from './utils/security';
import { evaluateValidationRules } from './utils/formulaEvaluator';
export { isSafeInternalPath };
import {
  Layers,
  LogOut,
  Inbox,
  Send,
  Share2,
  FileText,
  BarChart3,
  Plus,
  ArrowRightLeft,
  Users,
  Shield,
  Bot,
  Settings,
  Eye,
  XCircle,
  Clock,
  Star,
  Copy,
  CheckCircle,
  ShieldCheck,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  DatabaseBackup,
  Lock,
  ScanLine
} from 'lucide-react';
import {
  Icon3DInbox,
  Icon3DOutbox,
  Icon3DCc,
  Icon3DForms,
  Icon3DReports,
  Icon3DBuilder,
  Icon3DOversight,
  Icon3DUsers,
  Icon3DGroups,
  Icon3DAi,
  Icon3DMasterData,
  Icon3DBackupRestore,
  Icon3DSettings,
  Icon3DLogout
} from './components/Icons3D';

const VALID_TABS = [
  'inbox', 'outbox', 'cc-inbox', 'forms', 'reports', 'builder',
  'oversight', 'users-management', 'groups-management', 'master-data',
  'ai-settings', 'backup-restore', 'settings'
];

const ADMIN_ONLY_TABS = [
  'oversight', 'users-management', 'groups-management',
  'master-data', 'ai-settings', 'backup-restore', 'settings'
];

const SUPER_OR_ADMIN_TABS = ['reports', 'builder'];

const normalizeHashToTab = (rawHash) => {
  let hash = (rawHash || '').replace(/^#/, '').trim().toLowerCase();
  if (hash === 'users') hash = 'users-management';
  if (hash === 'groups') hash = 'groups-management';
  if (hash === 'ai') hash = 'ai-settings';
  if (hash === 'backup') hash = 'backup-restore';
  return hash;
};

const isTabAllowedForUser = (tab, targetUser) => {
  if (!tab || !VALID_TABS.includes(tab)) return false;
  const roles = Array.isArray(targetUser?.roles) ? targetUser.roles : [];
  const isAdmin = roles.includes('Admin');
  const isSuper = isAdmin || roles.includes('SuperUser');
  if (ADMIN_ONLY_TABS.includes(tab)) return isAdmin;
  if (SUPER_OR_ADMIN_TABS.includes(tab)) return isSuper;
  return true;
};

function AppContent() {
  const { toast, confirm, prompt } = useDialog();
  const [token, setToken] = useState(localStorage.getItem('bpms_token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('bpms_user') || '{}'));
  const userRef = useRef(user);
  userRef.current = user;

  // ایزوله‌سازی مسیرهای عمومی (/survey/ و /attachments/) یا وجود دیپ‌لینک مقصد جهت جلوگیری از الصاق هشتگ تب‌ها و رفرش‌های ناخواسته
  const isPublicSurveyPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/survey/');
  const isAttachmentFolderRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/attachments/');

  // بررسی و ذخیره امن پارامتر returnUrl از کوئری استرینگ در صورت وجود
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const returnUrlParam = urlParams.get('returnUrl');
      if (returnUrlParam && isSafeInternalPath(returnUrlParam)) {
        sessionStorage.setItem('bpms_post_login_redirect', returnUrlParam);
      }
    } catch (e) {
      console.warn('Error reading returnUrl param:', e);
    }
  }

  const hasPendingPostLoginRedirect = typeof window !== 'undefined' && isSafeInternalPath(sessionStorage.getItem('bpms_post_login_redirect'));
  if ((isPublicSurveyPath || isAttachmentFolderRoute || hasPendingPostLoginRedirect) && typeof window !== 'undefined' && window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  const getInitialActiveTab = () => {
    try {
      if (typeof window !== 'undefined' && (window.location.pathname.startsWith('/survey/') || window.location.pathname.startsWith('/attachments/'))) {
        return 'inbox';
      }

      const hash = normalizeHashToTab(window.location.hash);
      const saved = hash || sessionStorage.getItem('bpms_active_tab') || localStorage.getItem('bpms_active_tab');
      if (saved && VALID_TABS.includes(saved)) {
        const storedUser = JSON.parse(localStorage.getItem('bpms_user') || '{}');
        if (!isTabAllowedForUser(saved, storedUser)) {
          return 'inbox';
        }
        return saved;
      }
    } catch (e) {}
    return 'inbox';
  };

  const [activeTab, setActiveTab] = useState(getInitialActiveTab);
  const activeTabRef = useRef(activeTab);
  const [tabRefreshNonce, setTabRefreshNonce] = useState(0);

  // در صورتی که کاربر وارد شده باشد و مسیر دیپ‌لینک معتبری در انتظار باشد، بلافاصله هدایت شود
  useEffect(() => {
    if (token && typeof window !== 'undefined') {
      const redirectTarget = sessionStorage.getItem('bpms_post_login_redirect');
      if (redirectTarget && isSafeInternalPath(redirectTarget)) {
        sessionStorage.removeItem('bpms_post_login_redirect');
        window.location.href = redirectTarget;
      }
    }
  }, [token]);

  useEffect(() => {
    if (window.location.pathname.startsWith('/survey/') || window.location.pathname.startsWith('/attachments/')) return;
    const pendingRedirect = typeof window !== 'undefined' && sessionStorage.getItem('bpms_post_login_redirect');
    if (pendingRedirect && isSafeInternalPath(pendingRedirect)) return;

    if (token && !isTabAllowedForUser(activeTab, user)) {
      activeTabRef.current = 'inbox';
      sessionStorage.setItem('bpms_active_tab', 'inbox');
      localStorage.setItem('bpms_active_tab', 'inbox');
      if (window.location.hash !== '#inbox') {
        window.history.replaceState(null, '', '#inbox');
      }
      setActiveTab('inbox');
      return;
    }

    activeTabRef.current = activeTab;
    if (activeTab) {
      sessionStorage.setItem('bpms_active_tab', activeTab);
      localStorage.setItem('bpms_active_tab', activeTab);
      if (window.location.hash !== '#' + activeTab) {
        window.history.replaceState(null, '', '#' + activeTab);
      }
    }
  }, [activeTab, token, user]);

  useEffect(() => {
    if (window.location.pathname.startsWith('/survey/') || window.location.pathname.startsWith('/attachments/')) return;
    const pendingRedirect = typeof window !== 'undefined' && sessionStorage.getItem('bpms_post_login_redirect');
    if (pendingRedirect && isSafeInternalPath(pendingRedirect)) return;

    const onHashChange = () => {
      if (window.location.pathname.startsWith('/survey/') || window.location.pathname.startsWith('/attachments/')) return;
      const redirectNow = typeof window !== 'undefined' && sessionStorage.getItem('bpms_post_login_redirect');
      if (redirectNow && isSafeInternalPath(redirectNow)) return;

      const hash = normalizeHashToTab(window.location.hash);
      const currentUser = userRef.current;

      if (!hash || !VALID_TABS.includes(hash) || !isTabAllowedForUser(hash, currentUser)) {
        activeTabRef.current = 'inbox';
        sessionStorage.setItem('bpms_active_tab', 'inbox');
        localStorage.setItem('bpms_active_tab', 'inbox');
        if (window.location.hash !== '#inbox') {
          window.history.replaceState(null, '', '#inbox');
        }
        setActiveTab('inbox');
        return;
      }

      if (hash !== activeTabRef.current) {
        activeTabRef.current = hash;
        setActiveTab(hash);
      } else if (window.location.hash !== '#' + hash) {
        window.history.replaceState(null, '', '#' + hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // وضعیت تم با ۳ حالت 'system' (پیش‌فرض)، 'light' و 'dark' ذخیره‌شده در bpms_theme
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('bpms_theme') || 'system';
  });

  useEffect(() => {
    localStorage.setItem('bpms_theme', theme);

    const applyTheme = (isDark) => {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handleSystemThemeChange = (e) => {
        applyTheme(e.matches);
      };

      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else {
      applyTheme(theme === 'dark');
    }
  }, [theme]);

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [inbox, setInbox] = useState([]);
  const [outbox, setOutbox] = useState([]);
  const [ccInbox, setCcInbox] = useState([]);
  const [forms, setForms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [licenseExpiredData, setLicenseExpiredData] = useState(null);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const isAiEnabled = Boolean(licenseStatus?.enableAiModule);

  // نظارت بر کارتابل‌ها برای ادمین
  const [allPendingTasks, setAllPendingTasks] = useState([]);

  // تنظیمات نشست کاربری (Session Timeout)
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(() => {
    const saved = localStorage.getItem('bpms_session_timeout');
    return saved !== null ? parseInt(saved, 10) : 0; // 0 = نامحدود / عدم خروج خودکار
  });
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const lastActivityRef = useRef(Date.now());
  const isModalBusyRef = useRef(false);

  // مودال بازبینی محتوای فرم و کد JSON توسط ادمین
  const [inspectFormModal, setInspectFormModal] = useState(null);
  const [inspectTab, setInspectTab] = useState('visual');

  // تفویض کارتابل (Delegation)
  const [activeDelegation, setActiveDelegation] = useState(null);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [delegationForm, setDelegationForm] = useState({ toUserId: '', startDate: '', endDate: '' });

  // تنظیمات دامین، برندینگ و ایمیل
  const [adSettings, setAdSettings] = useState({
    domainName: 'company.local',
    ldapServer: '192.168.1.10',
    ldapPort: 389,
    serviceUser: 'service_user@company.local',
    servicePassword: '',
    isEnabled: true
  });
  const [branding, setBranding] = useState({ logoUrl: '/branding/Logo.png', systemTitle: 'نوافلو', version: '3' });
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    const title = branding?.systemTitle?.trim();
    if (title && title !== 'نوافلو' && title !== 'درگاه فرآیندهای سازمانی') {
      document.title = `${title} | سامانه مدیریت فرآیندهای سازمانی`;
    } else {
      document.title = 'نوافلو (NovaFlow) | سامانه مدیریت فرآیندهای سازمانی';
    }

    const v = branding?.version || '3';
    const iconUrl = `/api/branding/pwa-icon/favicon?v=${encodeURIComponent(v)}`;
    const appleIconUrl = `/api/branding/pwa-icon/apple-touch?v=${encodeURIComponent(v)}`;

    let iconLink = document.querySelector("link[rel='icon']");
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      iconLink.type = 'image/png';
      document.head.appendChild(iconLink);
    }
    iconLink.href = iconUrl;

    let appleLink = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleLink) {
      appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      document.head.appendChild(appleLink);
    }
    appleLink.href = appleIconUrl;
  }, [branding?.systemTitle, branding?.logoUrl, branding?.version]);
  const [securityPolicy, setSecurityPolicy] = useState({
    enablePasswordPolicy: false,
    minPasswordLength: 6,
    requireUppercase: false,
    requireLowercase: false,
    requireDigit: false,
    requireSpecialChar: false,
    enableAccountLockout: true,
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15
  });
  const [mobileScannerOpen, setMobileScannerOpen] = useState(false);
  const [cartableExternalSearch, setCartableExternalSearch] = useState(null);
  const lastActiveFormElementRef = useRef(null);

  useEffect(() => {
    document.title = 'نوافلو (NovaFlow) | سامانه مدیریت فرآیندهای سازمانی';
  }, []);

  const [emailSettings, setEmailSettings] = useState({
    smtpHost: '192.168.1.25',
    smtpPort: 587,
    smtpUser: 'noreply@company.local',
    smtpPassword: '',
    fromEmail: 'bpms@company.local',
    fromName: 'سامانه فرآیندهای سازمانی BPMS',
    enableSsl: true,
    sendOnInboxTask: true,
    defaultSubject: 'وظیفه جدید در کارتابل BPMS: {FormTitle}',
    defaultBody: 'با سلام،\nدرخواست جدیدی با کد رهگیری {TrackingCode} از طرف {SenderName} جهت بررسی در کارتابل شما ثبت شده است.\nجهت اقدام به سامانه مراجعه فرمایید:\n{PortalLink}'
  });

  // فرم‌ساز و ماتریس گردش‌کار
  const [editingFormId, setEditingFormId] = useState(null);
  const [formTitle, setFormTitle] = useState('فرم سازمانی جدید');
  const [formDesc, setFormDesc] = useState('توضیحات و راهنمای تکمیل فرم...');
  const [showLogoInForm, setShowLogoInForm] = useState(true);
  const [formIsPublic, setFormIsPublic] = useState(false);
  const [hasPublicDeadline, setHasPublicDeadline] = useState(false);
  const [publicCloseDate, setPublicCloseDate] = useState('');
  const [publicCloseTime, setPublicCloseTime] = useState('23:59');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [activeCardId, setActiveCardId] = useState('q_1');
  const [sections, setSections] = useState([
    {
      sectionId: 'sec_1',
      title: 'بخش اول: اطلاعات اولیه',
      description: 'لطفاً اطلاعات هویتی و عمومی درخواست را وارد کنید.',
      questions: [
        { id: 'q_1', type: 'text', label: 'عنوان کامل درخواست', required: true, options: [] },
        { id: 'q_2', type: 'date', label: 'تاریخ انجام یا اعمال (شمسی)', required: true, options: [] }
      ]
    }
  ]);

  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [defaultCcUserIds, setDefaultCcUserIds] = useState([]);
  const [defaultCcGroupIds, setDefaultCcGroupIds] = useState([]);
  const [savingForm, setSavingForm] = useState(false);
  const [formPrintTemplates, setFormPrintTemplates] = useState([]);
  const [validationRules, setValidationRules] = useState([]);

  // مودال‌ها
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSecIdx, setPreviewSecIdx] = useState(0);
  const [previewData, setPreviewData] = useState({});

  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerForm, setRunnerForm] = useState(null);
  const [runnerSecIdx, setRunnerSecIdx] = useState(0);
  const [runnerData, setRunnerData] = useState({});
  const [runnerError, setRunnerError] = useState('');
  const [continuousEntryMode, setContinuousEntryMode] = useState(false);
  const [runnerToast, setRunnerToast] = useState(null);

  const runnerValidation = useMemo(() => {
    if (!runnerOpen || !runnerForm?.parsedSchema) {
      return { hasRules: false, isValid: true, failedRules: [] };
    }
    return evaluateValidationRules(
      runnerForm.parsedSchema.validationRules || [],
      runnerData,
      runnerForm.parsedSchema.sections || []
    );
  }, [runnerOpen, runnerForm, runnerData]);

  useEffect(() => {
    if (runnerOpen) {
      setTimeout(() => {
        const container = document.getElementById('runner-modal-container');
        const firstInput = container?.querySelector('input:not([disabled]):not([readonly]), select:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
        firstInput?.focus();
      }, 120);
    }
  }, [runnerOpen, runnerSecIdx]);

  // نظرسنجی عمومی و صفحه سپاسگزاری اختصاصی
  const [isPublicRoute, setIsPublicRoute] = useState(window.location.pathname.startsWith('/survey/'));
  const [publicLoading, setPublicLoading] = useState(window.location.pathname.startsWith('/survey/'));
  const [publicSubmitted, setPublicSubmitted] = useState(false);
  const [publicTrackingCode, setPublicTrackingCode] = useState('');
  const [publicClosedMessage, setPublicClosedMessage] = useState('');

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/survey\/([a-zA-Z0-9_-]+)$/);
    if (match) {
      setIsPublicRoute(true);
      setPublicLoading(true);
      const tokenOrId = match[1];

      api.get('/settings/branding', { headers: { Authorization: '' } })
        .then((bRes) => { if (bRes?.data) setBranding(bRes.data); })
        .catch(() => {});

      api.get(`/forms/public/${tokenOrId}`, { headers: { Authorization: '' } })
        .then((res) => {
          const check = isPublicSurveyClosed(res.data);
          if (check.closed) {
            setPublicClosedMessage(check.reason);
          } else {
            handleOpenRunner(res.data, true);
          }
          setPublicLoading(false);
        })
        .catch((err) => {
          console.error('Error loading public form:', err);
          setPublicClosedMessage(err.response?.data?.message || 'این فرم نظرسنجی در حال حاضر در دسترس نیست یا حذف شده است.');
          setPublicLoading(false);
        });
    }
    // دریافت برندینگ برای صفحه پیوست‌ها
    if (isAttachmentFolderRoute) {
      api.get('/settings/branding', { headers: { Authorization: '' } })
        .then((bRes) => { if (bRes?.data) setBranding(bRes.data); })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    // بررسی وضعیت لایسنس سرور هنگام بارگذاری اولیه سامانه
    if (window.location.pathname.startsWith('/survey/') || window.location.pathname.startsWith('/attachments/')) return;
    api.get('/license/status')
      .then(res => {
        setLicenseStatus(res.data);
        if (res.data?.status === 'Expired') {
          setLicenseExpiredData(res.data);
        }
      })
      .catch(() => {
        api.get('/license/public-status')
          .then(res => {
            setLicenseStatus(res.data);
            if (res.data?.status === 'Expired') {
              setLicenseExpiredData(res.data);
            }
          })
          .catch(() => {});
      });
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
      lastActivityRef.current = Date.now();

      // هدایت خودکار به مسیر ذخیره‌شده (دیپ‌لینک پیوست‌ها یا مسیرهای مستقیم) بلافاصله پس از لاگین
      const redirectUrl = sessionStorage.getItem('bpms_post_login_redirect');
      if (redirectUrl && isSafeInternalPath(redirectUrl)) {
        sessionStorage.removeItem('bpms_post_login_redirect');
        window.location.href = redirectUrl;
        return;
      }

      const savedTab = localStorage.getItem('bpms_active_tab') || 'inbox';
      setActiveTab(isTabAllowedForUser(savedTab, data) ? savedTab : 'inbox');
    } catch (err) {
      setLoginError(err.response?.data?.message || 'نام کاربری یا کلمه عبور اشتباه است.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('bpms_token');
    localStorage.removeItem('bpms_user');
    localStorage.removeItem('bpms_active_tab');
    setToken(null);
    setUser({});
    setActiveTab('inbox');
  };

  const isPrintDesignerOpen = () => {
    return Boolean(
      window.__bpms_print_designer_open ||
      document.body.getAttribute('data-print-designer-open') === 'true' ||
      document.querySelector('[data-print-designer-modal="true"]')
    );
  };

  const isFormDesignActive = () => {
    return (
      activeTabRef.current === 'builder' ||
      activeTab === 'builder' ||
      isModalBusyRef.current ||
      isPrintDesignerOpen()
    );
  };

  // بررسی دقیق شرایط مجاز بودن رفرش خودکار (محدود به ۵ تب عملیاتی، بدون مودال و بدون پس‌زمینه)
  const isAutoRefreshAllowed = () => {
    if (typeof window === 'undefined') return false;
    if (document.hidden) return false;

    // ۱. رفرش خودکار در مسیرهای عمومی (/survey/) و پوشه پیوست‌ها (/attachments/) کاملاً متوقف است
    const path = window.location.pathname || '';
    if (path.startsWith('/attachments/') || path.startsWith('/survey/')) {
      return false;
    }

    // ۲. تب فعال باید دقیقاً یکی از ۵ تب عملیاتی دارای کارتابل و ورودی باشد
    const OPERATIONAL_TABS = ['inbox', 'outbox', 'tracking', 'cc', 'forms', 'monitoring'];
    const curTab = (activeTabRef.current || activeTab || '').toLowerCase();
    if (!OPERATIONAL_TABS.includes(curTab)) {
      return false;
    }

    // ۳. هیچ مودال فعالی (اجرای فرم، پیش‌نمایش، خروجی PDF، طراح قالب چاپ و ...) باز نباشد
    const isPdfPreviewOpen = Boolean(
      document.getElementById('bpms-pdf-preview-modal') ||
      document.querySelector('[data-pdf-preview-modal="true"]')
    );
    const isGlobalModalOpen = Boolean(document.querySelector('[data-bpms-global-modal="true"]'));

    if (runnerOpen || previewOpen || isPdfPreviewOpen || isGlobalModalOpen || isModalBusyRef.current || isPrintDesignerOpen()) {
      return false;
    }

    return true;
  };

  const fetchData = async (silent = false) => {
    // در صورت رفرش دوره‌ای پس‌زمینه، فقط زمانی اجرا شود که واجد تمامی شرایط مجاز باشد
    if (silent && !isAutoRefreshAllowed()) {
      return;
    }
    // در بارگذاری اولیه نیز نباید در تب طراحی فرم یا هنگام باز بودن طراح قالب چاپ اجرا شود
    if (isFormDesignActive()) {
      return;
    }
    try {
      const [inboxRes, outboxRes, ccRes, formsRes, groupsRes, brandingRes] = await Promise.all([
        api.get('/workflow/inbox').catch(() => ({ data: [] })),
        api.get('/workflow/outbox').catch(() => ({ data: [] })),
        api.get('/workflow/cc').catch(() => ({ data: [] })),
        api.get('/forms').catch(() => ({ data: [] })),
        api.get('/groups').catch(() => ({ data: [] })),
        api.get('/settings/branding').catch(() => ({ data: null }))
      ]);
      setInbox(inboxRes.data || []);
      setOutbox(outboxRes.data || []);
      setCcInbox(ccRes.data || []);
      setForms(formsRes.data || []);
      setGroups(groupsRes.data || []);
      if (brandingRes?.data) setBranding(brandingRes.data);
      setLastSyncTime(new Date());

      api.get('/workflow/delegate').then(res => setActiveDelegation(res.data)).catch(() => {});
      api.get('/license/status').then(res => setLicenseStatus(res.data)).catch(() => {});

      if (user.roles?.includes('SuperUser') && !user.roles?.includes('Admin')) {
        const dirRes = await api.get('/users/directory').catch(() => ({ data: [] }));
        if (Array.isArray(dirRes?.data)) setUsersList(dirRes.data);
      }

      if (user.roles?.includes('Admin')) {
        if (silent) {
          const pendingTasksRes = await api.get('/workflow/admin/all-tasks').catch(() => ({ data: [] }));
          if (pendingTasksRes?.data) setAllPendingTasks(pendingTasksRes.data);
        } else {
          const [uListRes, adRes, emailRes, pendingTasksRes, sessionRes, secPolicyRes] = await Promise.all([
            api.get('/users').catch(() => ({ data: [] })),
            api.get('/settings/ad').catch(() => ({ data: null })),
            api.get('/settings/email').catch(() => ({ data: null })),
            api.get('/workflow/admin/all-tasks').catch(() => ({ data: [] })),
            api.get('/settings/session').catch(() => ({ data: null })),
            api.get('/settings/security-policy').catch(() => ({ data: null }))
          ]);
          if (uListRes?.data) setUsersList(uListRes.data);
          if (adRes?.data) setAdSettings(prev => ({ ...prev, ...adRes.data }));
          if (emailRes?.data) setEmailSettings(emailRes.data);
          if (pendingTasksRes?.data) setAllPendingTasks(pendingTasksRes.data);
          if (sessionRes?.data && typeof sessionRes.data.sessionTimeoutMinutes === 'number') {
            setSessionTimeoutMinutes(sessionRes.data.sessionTimeoutMinutes);
            localStorage.setItem('bpms_session_timeout', String(sessionRes.data.sessionTimeoutMinutes));
          }
          if (secPolicyRes?.data) setSecurityPolicy(prev => ({ ...prev, ...secPolicyRes.data }));
        }
      }
    } catch (err) {
      console.error('Error fetching data', err);
    }
  };

  useEffect(() => {
    const isPdfPreviewOpen = Boolean(
      typeof document !== 'undefined' &&
      (document.getElementById('bpms-pdf-preview-modal') || document.querySelector('[data-pdf-preview-modal="true"]'))
    );
    isModalBusyRef.current = Boolean(
      runnerOpen || previewOpen || isPdfPreviewOpen || delegationModalOpen || inspectFormModal || mobileScannerOpen
    );
  }, [runnerOpen, previewOpen, delegationModalOpen, inspectFormModal, mobileScannerOpen]);

  // ردیابی آخرین فیلد یا سلول فعال در فرم‌های باز برای درج خودکار مقدار اسکن‌شده موبایل
  useEffect(() => {
    const handleFocusIn = (e) => {
      const el = e.target;
      if (!el || el.nodeType !== 1) return;

      // اگر فوکوس روی کادر جستجوی پورتال MasterLookupInput بود، به تریگر والد متصل می‌کنیم تا پس از بسته شدن دراپ‌داون از دست نرود
      if (el.matches?.('[data-master-lookup-search="true"]')) {
        const lookupFor = el.getAttribute('data-lookup-for');
        const ownerTrigger = lookupFor
          ? document.querySelector(`[data-lookup-instance="${CSS.escape(lookupFor)}"]`)
          : null;
        lastActiveFormElementRef.current = ownerTrigger || el;
        return;
      }

      const inEditableForm = el.closest?.('[data-dynamic-form-renderer="editable"], #runner-modal-container');
      if (!inEditableForm) return;
      const isTextControl =
        (el.tagName === 'TEXTAREA' && !el.disabled && !el.readOnly) ||
        (el.tagName === 'INPUT' &&
          !el.disabled &&
          !el.readOnly &&
          ['text', 'search', 'number', 'tel', 'email', 'url', ''].includes((el.type || '').toLowerCase())) ||
        el.matches?.('[data-lookup-trigger="true"]');
      if (isTextControl) {
        lastActiveFormElementRef.current = el;
      }
    };
    document.addEventListener('focusin', handleFocusIn, true);
    return () => document.removeEventListener('focusin', handleFocusIn, true);
  }, []);

  const handleInsertScannedToActiveForm = useCallback((rawValue) => {
    const valueStr = String(rawValue ?? '').trim();
    if (!valueStr) return;

    let target = lastActiveFormElementRef.current;
    if (target && !target.isConnected && target.getAttribute?.('data-lookup-for')) {
      const lookupFor = target.getAttribute('data-lookup-for');
      const ownerTrigger = document.querySelector(`[data-lookup-instance="${CSS.escape(lookupFor)}"]`);
      if (ownerTrigger) target = ownerTrigger;
    }

    if (!target || !target.isConnected || target.disabled || target.readOnly) {
      const activeLookupSearch = document.querySelector('[data-master-lookup-search="true"]:not([disabled])');
      if (activeLookupSearch) {
        const lookupFor = activeLookupSearch.getAttribute('data-lookup-for');
        const ownerTrigger = lookupFor
          ? document.querySelector(`[data-lookup-instance="${CSS.escape(lookupFor)}"]`)
          : null;
        target = ownerTrigger || activeLookupSearch;
      }
    }

    if (!target || !target.isConnected || target.disabled || target.readOnly) {
      const editableRoots = Array.from(document.querySelectorAll('[data-dynamic-form-renderer="editable"]'));
      const runnerRoot = document.getElementById('runner-modal-container');
      const scopes = runnerRoot ? [runnerRoot, ...editableRoots] : editableRoots;
      target = null;
      for (const scope of scopes) {
        const candidate = scope.querySelector(
          '[data-master-lookup-search="true"]:not([disabled]), input[type="text"]:not([disabled]):not([readonly]), input[type="search"]:not([disabled]):not([readonly]), input[type="number"]:not([disabled]):not([readonly]), input:not([type]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), [data-lookup-trigger="true"]'
        );
        if (candidate) {
          target = candidate;
          break;
        }
      }
    }

    if (!target) {
      toast.warning('هیچ فیلد یا سلول متنی قابل ویرایشی در فرم باز پیدا نشد؛ مقدار در حافظه موقت کپی شد.');
      setMobileScannerOpen(false);
      return;
    }

    if (target.matches?.('[data-lookup-trigger="true"]')) {
      target.dispatchEvent(new CustomEvent('bpms-fill-lookup', { detail: { value: valueStr } }));
      toast.success('کد اسکن‌شده در فیلد جستجوی Lookup درج شد.');
      setMobileScannerOpen(false);
      return;
    }

    if (target.matches?.('[data-master-lookup-search="true"]')) {
      const lookupFor = target.getAttribute('data-lookup-for');
      const ownerTrigger = lookupFor
        ? document.querySelector(`[data-lookup-instance="${CSS.escape(lookupFor)}"]`)
        : null;
      if (ownerTrigger) {
        ownerTrigger.dispatchEvent(new CustomEvent('bpms-fill-lookup', { detail: { value: valueStr } }));
        toast.success('کد اسکن‌شده در فیلد جستجوی Lookup درج شد.');
        setMobileScannerOpen(false);
        return;
      }
    }

    const proto = target.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(target, valueStr);
    } else {
      target.value = valueStr;
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
    toast.success('مقدار اسکن‌شده با موفقیت در فیلد فعال فرم درج شد.');
    setMobileScannerOpen(false);
  }, [toast]);

  const handleSearchScannedInCartable = useCallback((query) => {
    const q = String(query ?? '').trim();
    if (!q) return;
    const targetTab = ['inbox', 'outbox', 'cc-inbox'].includes(activeTab) ? activeTab : 'inbox';
    setRunnerOpen(false);
    setPreviewOpen(false);
    activeTabRef.current = targetTab;
    setActiveTab(targetTab);
    setCartableExternalSearch({
      nonce: Date.now(),
      tab: targetTab,
      query: q
    });
    setMobileScannerOpen(false);
    toast.success(`جستجوی «${q}» در کارتابل اعمال شد.`);
  }, [activeTab, toast]);

  const handleOpenScannedAttachments = useCallback((parsed) => {
    if (!parsed) return;
    const code = (parsed.trackingCode || '').trim();
    const rawCandidate =
      parsed.attachmentPath ||
      (parsed.internalPath && parsed.internalPath.startsWith('/attachments/') ? parsed.internalPath : null) ||
      (code ? `/attachments/${encodeURIComponent(code)}` : null);

    if (rawCandidate && isSafeInternalPath(rawCandidate)) {
      setMobileScannerOpen(false);
      window.location.assign(rawCandidate);
      return;
    }

    if (parsed.rawValue && /^https?:\/\//i.test(parsed.rawValue)) {
      try {
        const u = new URL(parsed.rawValue);
        const safePath = `${u.pathname}${u.search}${u.hash}`;
        if (isSafeInternalPath(safePath)) {
          setMobileScannerOpen(false);
          window.location.assign(safePath);
          return;
        }
      } catch {
        // ignore invalid URL
      }
    }

    toast.warning('آدرس معتبری برای صفحه پیوست‌های پرونده یافت نشد.');
    setMobileScannerOpen(false);
  }, [toast]);

  const handleOpenScannedSubmission = useCallback(async (parsed) => {
    if (!parsed) return;
    if (parsed.isAttachmentLink || parsed.internalPath?.startsWith('/attachments/')) {
      handleOpenScannedAttachments(parsed);
      return;
    }

    const code = (parsed.trackingCode || '').trim().toUpperCase();
    const internalPath = parsed.internalPath || null;

    if (code) {
      const findInLists = (inboxList, outboxList, ccList) => {
        const matchFn = (item) => String(item?.trackingCode || '').trim().toUpperCase() === code;
        const inboxMatch = (inboxList || []).find(matchFn);
        if (inboxMatch) return { tab: 'inbox', item: inboxMatch };
        const outboxMatch = (outboxList || []).find(matchFn);
        if (outboxMatch) return { tab: 'outbox', item: outboxMatch };
        const ccMatch = (ccList || []).find(matchFn);
        if (ccMatch) return { tab: 'cc-inbox', item: ccMatch };
        return null;
      };

      let found = findInLists(inbox, outbox, ccInbox);
      if (!found) {
        try {
          const [iRes, oRes, cRes] = await Promise.all([
            api.get('/workflow/inbox').catch(() => ({ data: [] })),
            api.get('/workflow/outbox').catch(() => ({ data: [] })),
            api.get('/workflow/cc').catch(() => ({ data: [] }))
          ]);
          const freshInbox = iRes?.data || [];
          const freshOutbox = oRes?.data || [];
          const freshCc = cRes?.data || [];
          setInbox(freshInbox);
          setOutbox(freshOutbox);
          setCcInbox(freshCc);
          found = findInLists(freshInbox, freshOutbox, freshCc);
        } catch (err) {
          console.warn('Error refreshing cartable for barcode match:', err);
        }
      }

      if (found) {
        const subId = found.item.submissionID || found.item.submissionId;
        setRunnerOpen(false);
        setPreviewOpen(false);
        activeTabRef.current = found.tab;
        setActiveTab(found.tab);
        setCartableExternalSearch({
          nonce: Date.now(),
          tab: found.tab,
          query: found.item.trackingCode || code,
          expandSubmissionId: subId,
          selectSubmissionId: subId
        });
        setMobileScannerOpen(false);
        toast.success(`پرونده با کد رهگیری ${code} در کارتابل باز شد.`);
        return;
      }
    }

    if (internalPath && (internalPath.startsWith('/attachments/') || internalPath.startsWith('/survey/')) && isSafeInternalPath(internalPath)) {
      setMobileScannerOpen(false);
      window.location.assign(internalPath);
      return;
    }

    if (code) {
      setRunnerOpen(false);
      setPreviewOpen(false);
      activeTabRef.current = 'inbox';
      setActiveTab('inbox');
      setCartableExternalSearch({
        nonce: Date.now(),
        tab: 'inbox',
        query: code
      });
      setMobileScannerOpen(false);
      toast.info(`پرونده ${code} برای جستجو به کارتابل ارسال شد.`);
      return;
    }

    handleSearchScannedInCartable(parsed.rawValue);
  }, [inbox, outbox, ccInbox, handleOpenScannedAttachments, handleSearchScannedInCartable, toast]);

  useEffect(() => {
    if (!token) return;
    fetchData(false);

    // به‌روزرسانی خودکار فقط در ۵ تب عملیاتی و بدون مودال و بدون پس‌زمینه
    const pollInterval = setInterval(() => {
      if (isAutoRefreshAllowed()) {
        fetchData(true);
      }
    }, 15000);

    const handleSyncTrigger = () => {
      if (isAutoRefreshAllowed()) {
        fetchData(true);
      }
    };

    document.addEventListener('visibilitychange', handleSyncTrigger);
    window.addEventListener('focus', handleSyncTrigger);
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleSyncTrigger);
      window.removeEventListener('focus', handleSyncTrigger);
    };
  }, [token]);

  // مدیریت هوشمند نشست کاربری (تمدید خودکار توکن هنگام فعالیت یا حالت عدم خروج خودکار)
  useEffect(() => {
    if (!token) return;

    const markActive = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, markActive, { passive: true }));

    const sessionTimer = setInterval(async () => {
      const idleMs = Date.now() - lastActivityRef.current;
      const timeoutMs = sessionTimeoutMinutes > 0 ? sessionTimeoutMinutes * 60 * 1000 : 0;

      if (timeoutMs > 0 && idleMs >= timeoutMs) {
        handleLogout();
        return;
      }

      // تمدید بی‌صدای توکن در پس‌زمینه برای جلوگیری از خروج ناگهانی
      try {
        const res = await api.post('/auth/refresh');
        if (res.data?.token) {
          localStorage.setItem('bpms_token', res.data.token);
          setToken(res.data.token);
        }
      } catch (e) {}
    }, 5 * 60 * 1000); // بررسی و تمدید هر ۵ دقیقه

    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActive));
      clearInterval(sessionTimer);
    };
  }, [token, sessionTimeoutMinutes]);

  const handleSaveAndPublishForm = async (overrideTitle = null) => {
    if (savingForm) return;
    setSavingForm(true);
    try {
      const effectiveTitle = (typeof overrideTitle === 'string' && overrideTitle.trim() ? overrideTitle : formTitle).trim();
      const isSuperUserCreating = !user.roles?.includes('Admin') && !formIsPublic;
      const publicExpiresAt = (formIsPublic && hasPublicDeadline && publicCloseDate)
        ? buildIsoFromJalaliAndTime(publicCloseDate, publicCloseTime)
        : null;

      const normalizedSteps = formIsPublic ? [] : workflowSteps.map((st, sIdx) => {
        const conds = (st.conditions && st.conditions.length > 0)
          ? st.conditions.filter(c => c.field)
          : (st.conditionField ? [{ field: st.conditionField, operator: st.conditionOperator || '>', value: st.conditionValue || '' }] : []);
        return {
          ...st,
          stepIndex: sIdx,
          conditionLogic: st.conditionLogic || 'AND',
          conditions: conds
        };
      });

      // ۲. مکانیزم پاکسازی خودکار فیلدهای حذف‌شده از قالب‌های چاپ (Orphan Field Guard)
      const currentFieldIds = new Set();
      (sections || []).forEach(sec => {
        (sec.questions || []).forEach(q => {
          if (q.id) currentFieldIds.add(q.id);
        });
      });

      const removedOrphanFields = [];
      const cleanedTemplates = (formPrintTemplates || []).map(tpl => {
        const originalBlocks = tpl.blocks || [];
        const validBlocks = [];
        originalBlocks.forEach(b => {
          if (b.type === 'field') {
            if (currentFieldIds.has(b.fieldId)) {
              validBlocks.push(b);
            } else {
              removedOrphanFields.push({
                templateName: tpl.name || 'قالب بدون عنوان',
                fieldLabel: b.label || b.fieldId
              });
            }
          } else {
            validBlocks.push(b);
          }
        });
        return { ...tpl, blocks: validBlocks };
      });

      const schema = {
        showLogo: showLogoInForm,
        isPublic: formIsPublic,
        publicCloseDate: (formIsPublic && hasPublicDeadline) ? publicCloseDate : null,
        publicCloseTime: (formIsPublic && hasPublicDeadline) ? publicCloseTime : null,
        publicExpiresAt: publicExpiresAt,
        sections: sections,
        printTemplates: cleanedTemplates,
        validationRules: (validationRules || []).filter(r => r && (r.formula || '').trim()),
        workflowPolicy: {
          steps: normalizedSteps,
          defaultCcUserIds: formIsPublic ? [] : defaultCcUserIds,
          defaultCcGroupIds: formIsPublic ? [] : defaultCcGroupIds,
          requireAdminApprovalOnPublish: isSuperUserCreating
        }
      };

      if (editingFormId) {
        try {
          const res = await api.post(`/forms/${editingFormId}/new-version`, {
            title: effectiveTitle,
            description: formDesc,
            schemaJson: JSON.stringify(schema)
          });
          const createdVerId = res.data?.formID || editingFormId;
          await api.post(`/groups/forms/${createdVerId}/access`, { groupIds: selectedGroups }).catch(() => {});
          if (res.data.status === 'PendingApproval') {
            toast.success('نگارش جدید فرم ایجاد شد و جهت تایید و فعال‌سازی به مدیر سیستم ارسال گردید.');
          } else {
            toast.success('نگارش جدید فرم با موفقیت ثبت و نسخه قبلی بایگانی شد.');
          }
        } catch (verErr) {
          await api.put(`/forms/${editingFormId}`, {
            title: effectiveTitle,
            description: formDesc,
            schemaJson: JSON.stringify(schema)
          });
          toast.success('نگارش فرم به‌روزرسانی شد.');
        }
      } else {
        const res = await api.post('/forms', {
          title: effectiveTitle,
          description: formDesc,
          schemaJson: JSON.stringify(schema),
          category: 'سازمانی'
        });
        const newId = res.data.formID;

        if (isSuperUserCreating) {
          await api.post(`/forms/${newId}/request-approval`);
          toast.success('فرم ثبت شد و جهت بازبینی و فعال‌سازی نهایی به مدیر سیستم ارسال گردید.');
        } else {
          await api.post(`/forms/${newId}/publish`);
          toast.success('فرم با موفقیت ذخیره و در سازمان منتشر شد.');
        }

        if (selectedGroups.length > 0) {
          await api.post(`/groups/forms/${newId}/access`, { groupIds: selectedGroups });
        }
      }

      if (removedOrphanFields.length > 0) {
        const summary = removedOrphanFields.map(r => `• «${r.fieldLabel}» از قالب «${r.templateName}»`).join('\n');
        toast.warning(`پاکسازی خودکار قالب‌های چاپ:\nفیلدهای زیر به دلیل حذف از ساختار فرم، از قالب‌های چاپ مربوطه حذف شدند:\n\n${summary}`, 8000);
      }

      setEditingFormId(null);
      setFormPrintTemplates([]);
      setValidationRules([]);
      fetchData();
      setActiveTab('forms');
    } catch (err) {
      toast.error('خطا در ذخیره فرم: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingForm(false);
    }
  };

  const handleCloneForm = (form) => {
    try {
      const parsed = JSON.parse(form.schemaJson);
      setEditingFormId(form.formID);
      setFormTitle(form.title);
      setFormDesc(form.description || '');
      setShowLogoInForm(parsed.showLogo ?? true);
      setFormIsPublic(parsed.isPublic ?? false);
      setHasPublicDeadline(Boolean(parsed.publicExpiresAt || parsed.publicCloseDate));
      setPublicCloseDate(parsed.publicCloseDate || '');
      setPublicCloseTime(parsed.publicCloseTime || '23:59');
      setSections(parsed.sections || []);
      setFormPrintTemplates(parsed.printTemplates || []);
      setValidationRules(Array.isArray(parsed.validationRules) ? parsed.validationRules : []);

      const policy = parsed.workflowPolicy || {};
      const migratedSteps = (policy.steps || []).map(st => ({
        ...st,
        conditionLogic: st.conditionLogic || 'AND',
        conditions: (st.conditions && st.conditions.length > 0)
          ? st.conditions
          : (st.conditionField ? [{ field: st.conditionField, operator: st.conditionOperator || '>', value: st.conditionValue || '' }] : [])
      }));
      setWorkflowSteps(migratedSteps);
      setDefaultCcUserIds(policy.defaultCcUserIds || []);
      setDefaultCcGroupIds(policy.defaultCcGroupIds || []);

      api.get(`/groups/forms/${form.formID}/access`)
        .then(res => setSelectedGroups(res.data || []))
        .catch(() => setSelectedGroups([]));

      setActiveTab('builder');
    } catch (e) {
      toast.error('خطا در بارگذاری نگارش قبلی: ' + e.message);
    }
  };

  const handleCloneAsIndependentForm = async (form, overrideTitle = null, autoSave = false) => {
    try {
      const parsed = typeof form.schemaJson === 'string' ? JSON.parse(form.schemaJson) : (form.schemaJson || {});
      const finalTitle = (typeof overrideTitle === 'string' && overrideTitle.trim()) ? overrideTitle.trim() : `کپی از ${form.title}`;
      setEditingFormId(null); // کلید اصلی: عدم تعیین ID تا فرمی کاملاً مستقل و جدید ایجاد شود
      setFormTitle(finalTitle);
      setFormDesc(form.description || '');
      setShowLogoInForm(parsed.showLogo ?? true);
      setFormIsPublic(parsed.isPublic ?? false);
      setHasPublicDeadline(Boolean(parsed.publicExpiresAt || parsed.publicCloseDate));
      setPublicCloseDate(parsed.publicCloseDate || '');
      setPublicCloseTime(parsed.publicCloseTime || '23:59');
      setSections(parsed.sections || []);
      setFormPrintTemplates(parsed.printTemplates || []);
      setValidationRules(Array.isArray(parsed.validationRules) ? parsed.validationRules : []);

      const policy = parsed.workflowPolicy || {};
      const migratedSteps = (policy.steps || []).map(st => ({
        ...st,
        conditionLogic: st.conditionLogic || 'AND',
        conditions: (st.conditions && st.conditions.length > 0)
          ? st.conditions
          : (st.conditionField ? [{ field: st.conditionField, operator: st.conditionOperator || '>', value: st.conditionValue || '' }] : [])
      }));
      setWorkflowSteps(migratedSteps);
      setDefaultCcUserIds(policy.defaultCcUserIds || []);
      setDefaultCcGroupIds(policy.defaultCcGroupIds || []);

      const groupRes = await api.get(`/groups/forms/${form.formID}/access`).catch(() => ({ data: [] }));
      const formGroups = groupRes.data || [];
      setSelectedGroups(formGroups);

      if (autoSave) {
        setSavingForm(true);
        try {
          const isSuperUserCreating = !user.roles?.includes('Admin') && !parsed.isPublic;
          const publicExpiresAt = (parsed.isPublic && Boolean(parsed.publicExpiresAt || parsed.publicCloseDate) && parsed.publicCloseDate)
            ? buildIsoFromJalaliAndTime(parsed.publicCloseDate, parsed.publicCloseTime || '23:59')
            : null;

          const schema = {
            ...parsed,
            workflowPolicy: {
              ...policy,
              steps: parsed.isPublic ? [] : migratedSteps,
              defaultCcUserIds: parsed.isPublic ? [] : (policy.defaultCcUserIds || []),
              defaultCcGroupIds: parsed.isPublic ? [] : (policy.defaultCcGroupIds || []),
              requireAdminApprovalOnPublish: isSuperUserCreating
            }
          };

          const res = await api.post('/forms', {
            title: finalTitle,
            description: form.description || '',
            schemaJson: JSON.stringify(schema),
            category: 'سازمانی'
          });
          const newId = res.data.formID;

          if (isSuperUserCreating) {
            await api.post(`/forms/${newId}/request-approval`);
            toast.success(`فرم با نام «${finalTitle}» ایجاد شد و جهت بازبینی به مدیر سیستم ارسال گردید.`);
          } else {
            await api.post(`/forms/${newId}/publish`);
            toast.success(`فرم با نام «${finalTitle}» با موفقیت کپی و در سازمان منتشر شد.`);
          }

          if (formGroups.length > 0) {
            await api.post(`/groups/forms/${newId}/access`, { groupIds: formGroups }).catch(() => {});
          }

          await fetchData(false);
          setActiveTab('forms');
          return;
        } finally {
          setSavingForm(false);
        }
      }

      setActiveTab('builder');
      setTimeout(() => {
        document.getElementById('form-title-input')?.focus();
      }, 200);
    } catch (e) {
      toast.error('خطا در کپی فرم به عنوان فرم مستقل: ' + e.message);
    }
  };

  const handleExportFormSchema = async (form) => {
    try {
      const res = await api.get(`/forms/${form.formID}/export`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BPMS_Export_${form.title}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('خطا در دریافت خروجی فرم: ' + err.message);
    }
  };

  const handleImportFormSchema = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const exportDto = JSON.parse(text);
      if (exportDto.format !== 'BPMS_FORM_EXPORT_V1') {
        toast.error('فرمت فایل نامعتبر است.');
        return;
      }
      setFormTitle(exportDto.title || 'فرم درون‌ریزی‌شده');
      setFormDesc(exportDto.description || '');
      const parsed = JSON.parse(exportDto.schemaJson);
      setShowLogoInForm(parsed.showLogo ?? true);
      setFormIsPublic(parsed.isPublic ?? false);
      setHasPublicDeadline(Boolean(parsed.publicExpiresAt || parsed.publicCloseDate));
      setPublicCloseDate(parsed.publicCloseDate || '');
      setPublicCloseTime(parsed.publicCloseTime || '23:59');
      setSections(parsed.sections || []);
      setFormPrintTemplates(parsed.printTemplates || []);
      setValidationRules(Array.isArray(parsed.validationRules) ? parsed.validationRules : []);

      const policy = parsed.workflowPolicy || {};
      const migratedSteps = (policy.steps || []).map(st => ({
        ...st,
        conditionLogic: st.conditionLogic || 'AND',
        conditions: (st.conditions && st.conditions.length > 0)
          ? st.conditions
          : (st.conditionField ? [{ field: st.conditionField, operator: st.conditionOperator || '>', value: st.conditionValue || '' }] : [])
      }));
      setWorkflowSteps(migratedSteps);
      setDefaultCcUserIds(policy.defaultCcUserIds || []);
      setDefaultCcGroupIds(policy.defaultCcGroupIds || []);

      toast.success('اسکیما با موفقیت بارگذاری شد.');
    } catch (err) {
      toast.error('خطا در خواندن فایل اسکیما: ' + err.message);
    }
  };

  const buildInitialFormData = (parsedSchema) => {
    const init = {};
    (parsedSchema?.sections || []).forEach(sec => {
      (sec.questions || []).forEach(q => {
        if (q && q.id && q.defaultValue !== undefined && q.defaultValue !== null && q.defaultValue !== '') {
          init[q.id] = q.defaultValue;
        }
      });
    });
    return init;
  };

  const handleOpenRunner = (form, publicMode = false) => {
    try {
      if (!publicMode) {
        if (form.status !== 'Active') {
          toast.warning(form.status === 'PendingApproval' ? 'این فرم در انتظار تایید مدیر سیستم است.' : 'این فرم غیرفعال است.');
          return;
        }
        const check = isPublicSurveyClosed(form);
        if (check.closed) {
          toast.warning(check.reason);
          fetchData(true);
          return;
        }
      }
      const parsed = JSON.parse(form.schemaJson);
      setRunnerForm({ ...form, parsedSchema: parsed, isPublic: publicMode || parsed.isPublic });
      setRunnerSecIdx(0);
      setRunnerData(buildInitialFormData(parsed));
      setRunnerError('');
      setRunnerOpen(true);
    } catch (e) {
      toast.error('خطا در بارگذاری فرم: ' + e.message);
    }
  };

  const handleSubmitRunner = async (isContinuous = false) => {
    const deadlineCheck = isPublicSurveyClosed(runnerForm);
    if (deadlineCheck.closed) {
      setRunnerError(deadlineCheck.reason);
      return;
    }
    const currentSec = runnerForm.parsedSchema.sections[runnerSecIdx];
    for (const q of currentSec.questions) {
      if (q.type === 'label' || q.type === 'section' || q.type === 'sectionContainer') continue;
      const val = runnerData[q.id];
      const isEmpty = val === undefined || val === null || (Array.isArray(val) ? val.length === 0 : String(val).trim() === '');
      if (q.required && isEmpty) {
        setRunnerError(`پاسخ به سوال «${q.label}» الزامی است.`);
        return;
      }
      if (q.type === 'number' && q.maxDigits && runnerData[q.id]) {
        const valStr = String(runnerData[q.id]).replace(/\D/g, '');
        if (valStr.length > q.maxDigits) {
          setRunnerError(`تعداد ارقام فیلد «${q.label}» نمی‌تواند بیش از ${q.maxDigits} رقم باشد.`);
          return;
        }
      }
    }

    if (!runnerValidation.isValid) {
      setRunnerError(runnerValidation.failedRules[0]?.errorMessage || 'شرط اعتبارسنجی فرمولی فرم برقرار نیست.');
      return;
    }

    try {
      const payloadData = Object.keys(runnerData).length > 0 ? JSON.stringify(runnerData) : "{}";
      if (runnerForm.isPublic) {
        const res = await api.post('/workflow/submit-public', {
          formId: runnerForm.formID,
          formDataJson: payloadData,
          dataJson: payloadData
        });
        setPublicTrackingCode(res.data.trackingCode);
        setPublicSubmitted(true);
        // بستن بازگشت مرورگر جهت ممانعت از ثبت تکراری
        window.history.pushState(null, '', window.location.href);
        window.onpopstate = function () {
          window.history.go(1);
        };
        setRunnerOpen(false);
      } else {
        const res = await api.post('/workflow/submit', {
          formId: runnerForm.formID,
          formDataJson: payloadData,
          dataJson: payloadData
        });

        if (isContinuous) {
          setRunnerToast({
            trackingCode: res.data.trackingCode,
            message: `✅ درخواست با موفقیت در گردش‌کار ثبت گردید! کد رهگیری: ${res.data.trackingCode}`
          });
          setRunnerData(buildInitialFormData(runnerForm?.parsedSchema));
          setRunnerSecIdx(0);
          setRunnerError('');
          fetchData();

          // Focus first interactive input
          setTimeout(() => {
            const container = document.getElementById('runner-modal-container');
            const firstInput = container?.querySelector('input:not([disabled]):not([readonly]), select:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])');
            firstInput?.focus();
          }, 100);

          setTimeout(() => setRunnerToast(null), 5000);
        } else {
          toast.success(`درخواست با موفقیت ثبت شد!\nکد رهگیری: ${res.data.trackingCode}`, 6000);
          setRunnerOpen(false);
          fetchData();
          setActiveTab('outbox');
        }
      }
    } catch (err) {
      setRunnerError('خطا در ارسال فرم: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleDeleteForm = async (form) => {
    const confirmed = await confirm({
      title: 'حذف کامل فرم',
      message: `آیا از حذف کامل فرم «${form.title}» اطمینان دارید؟`,
      confirmText: 'تایید و حذف فرم',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await api.delete(`/forms/${form.formID}`);
      toast.success('فرم حذف شد.');
      fetchData();
    } catch (err) {
      toast.error('خطا در حذف فرم: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleToggleStatus = async (form) => {
    try {
      await api.post(`/forms/${form.formID}/toggle-status`);
      fetchData();
    } catch (err) {
      toast.error('خطا: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleAdminApproveForm = async (form) => {
    try {
      await api.post(`/forms/${form.formID}/admin-approve`);
      toast.success(`فرم «${form.title}» تایید و فعال شد.`);
      fetchData();
    } catch (err) {
      toast.error('خطا در تایید فرم: ' + err.message);
    }
  };

  const handleAdminRejectForm = async (form) => {
    const reason = await prompt({
      title: 'عدم تایید و بازگشت فرم به طراح',
      message: `لطفاً دلیل عدم تایید فرم «${form.title}» را برای اطلاع طراح وارد فرمایید:`,
      placeholder: 'دلیل عدم تایید یا اصلاحات مورد نیاز...',
      confirmText: 'ثبت و بازگشت فرم',
      variant: 'danger',
      required: true,
      requiredMessage: 'لطفاً دلیل عدم تایید فرم را وارد نمایید.',
      multiline: true
    });
    if (!reason || !reason.trim()) return;
    try {
      await api.post(`/forms/${form.formID}/admin-reject`, { reason: reason.trim() });
      toast.warning(`فرم «${form.title}» رد شد و جهت بازنگری به طراح فرآیند بازگردانده شد.`);
      fetchData();
    } catch (err) {
      toast.error('خطا: ' + err.message);
    }
  };

  const handleCopyPublicLink = (form) => {
    const token = form.publicToken || form.PublicToken || form.formID;
    const link = `${window.location.origin}/survey/${token}`;

    const fallbackCopy = async (text) => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          toast.success('لینک عمومی در حافظه کپی شد:\n' + text);
          return;
        }
      } catch (e) {}
      await prompt({
        title: 'کپی لینک عمومی نظرسنجی',
        message: 'دسترسی خودکار به کلیپ‌بورد در مرورگر محدود است. لطفاً لینک زیر را انتخاب و کپی نمایید:',
        defaultValue: text,
        confirmText: 'بستن',
        hideCancel: true,
        readOnly: true,
        dir: 'ltr',
        selectAllOnFocus: true,
        showCopyButton: true
      });
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link)
        .then(() => {
          toast.success('لینک عمومی در حافظه کپی شد:\n' + link);
        })
        .catch(() => {
          fallbackCopy(link);
        });
    } else {
      fallbackCopy(link);
    }
  };

  const handleTransition = async (submissionId, action, commentInput) => {
    let comment = commentInput;
    if (comment === undefined || comment === null) {
      const entered = await prompt({
        title: `ثبت توضیح برای اقدام ${action}`,
        message: `توضیح برای اقدام «${action}» را وارد نمایید (اختیاری):`,
        placeholder: 'یادداشت یا توضیح...',
        defaultValue: '',
        required: false,
        multiline: true
      });
      if (entered === null) return;
      comment = entered;
    }
    try {
      await api.post(`/workflow/submissions/${submissionId}/transition`, { action, comment });
      fetchData();
    } catch (err) {
      toast.error('خطا: ' + (err.response?.data?.message || err.message));
    }
  };

  // رندر صفحه عمومی نظرسنجی با صفحه تشکر اختصاصی
  if (isPublicRoute && publicSubmitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center space-y-6 animate-in zoom-in-95">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
            <CheckCircle className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">پاسخ شما با موفقیت ثبت شد</h2>
            <p className="text-xs text-slate-500 mt-2">با تشکر از همکاری و مشارکت شما در تکمیل این نظرسنجی.</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <span className="text-[11px] text-slate-400 block mb-1">کد رهگیری اختصاصی:</span>
            <span className="text-sm font-mono font-bold text-blue-600 select-all">{publicTrackingCode}</span>
          </div>
          <div className="pt-2">
            <span className="text-[11px] text-slate-400 block">پاسخ دریافت و قفل شد. بازگشت به صفحه ثبت مسدود است.</span>
          </div>
        </div>
      </div>
    );
  }

  if (isPublicRoute && publicLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        در حال بارگذاری فرم نظرسنجی...
      </div>
    );
  }

  if (isPublicRoute && publicClosedMessage) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center space-y-5 animate-in zoom-in-95">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
            <Clock className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">نظرسنجی در دسترس نیست</h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">{publicClosedMessage}</p>
          </div>
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 block">درگاه فرآیندهای سازمانی BPMS</span>
          </div>
        </div>
      </div>
    );
  }

  if (isPublicRoute && runnerForm) {
    return (
      <PublicSurveyPage
        form={runnerForm}
        branding={branding}
        onSubmit={async (submittedData, captchaInfo) => {
          const payloadData = Object.keys(submittedData).length > 0 ? JSON.stringify(submittedData) : "{}";
          const res = await api.post('/workflow/submit-public', {
            formId: runnerForm.formID,
            formDataJson: payloadData,
            dataJson: payloadData,
            captchaToken: captchaInfo?.captchaToken,
            captchaAnswer: captchaInfo?.captchaAnswer,
            honeypot: captchaInfo?.honeypot
          });
          setPublicTrackingCode(res.data.trackingCode);
          setPublicSubmitted(true);
          window.history.pushState(null, '', window.location.href);
          window.onpopstate = function () {
            window.history.go(1);
          };
        }}
      />
    );
  }

  if (licenseExpiredData) {
    return (
      <LicenseLockScreen
        licenseData={licenseExpiredData}
        onActivated={() => {
          setLicenseExpiredData(null);
          if (token) fetchData();
        }}
        onLogout={() => {
          setLicenseExpiredData(null);
          handleLogout();
        }}
      />
    );
  }

  // رندر صفحه کاوشگر امن پیوست‌های پرونده (/attachments/:trackingCode)
  if (isAttachmentFolderRoute) {
    const trackingCodeMatch = window.location.pathname.match(/\/attachments\/([^/?#]+)/);
    const trackingCodeParam = trackingCodeMatch ? decodeURIComponent(trackingCodeMatch[1]) : '';
    return (
      <AttachmentFolderPage
        trackingCode={trackingCodeParam}
        branding={branding}
        theme={theme}
        cycleTheme={cycleTheme}
      />
    );
  }

  if (!token) {
    return (
      <LoginPage
        token={token}
        setToken={setToken}
        setUser={setUser}
        lastActivityRef={lastActivityRef}
        setActiveTab={setActiveTab}
        theme={theme}
        cycleTheme={cycleTheme}
      />
    );
  }

  const accessibleForms = forms.filter(f => user.roles?.includes('Admin') || f.createdByUserID === user.userID);
  const distinctFormTitles = Array.from(new Set(accessibleForms.map(f => f.title)));

  const renderNavItems = (onItemClick = null) => {
    const handleItemClick = (tab, extraAction = null) => {
      if (window.location.pathname.startsWith('/survey/')) return;
      if (!isTabAllowedForUser(tab, user)) {
        activeTabRef.current = 'inbox';
        setActiveTab('inbox');
        sessionStorage.setItem('bpms_active_tab', 'inbox');
        localStorage.setItem('bpms_active_tab', 'inbox');
        if (window.location.hash !== '#inbox') {
          window.history.replaceState(null, '', '#inbox');
        }
        if (onItemClick) onItemClick();
        return;
      }
      activeTabRef.current = tab;
      setActiveTab(tab);
      sessionStorage.setItem('bpms_active_tab', tab);
      localStorage.setItem('bpms_active_tab', tab);
      if (window.location.hash !== '#' + tab) {
        window.history.replaceState(null, '', '#' + tab);
      }
      setTabRefreshNonce(prev => prev + 1);

      if (tab !== 'builder') {
        fetchData();
      }
      if (extraAction) extraAction();
      if (onItemClick) onItemClick();
    };

    const getNavClass = (tab) => `w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer border-0 ${
      activeTab === tab
        ? 'bg-[#1a8aec] text-white font-bold shadow-md shadow-blue-500/20'
        : 'bg-transparent border-transparent text-slate-700 hover:bg-slate-200/75 hover:text-slate-900 dark:text-[#f1f2f3] dark:hover:bg-white/10 dark:hover:text-white'
    }`;

    return (
      <div className="space-y-1.5">
        <button
          onClick={() => handleItemClick('inbox')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer border-0 ${
            activeTab === 'inbox'
              ? 'bg-[#1a8aec] text-white font-bold shadow-md shadow-blue-500/20'
              : 'bg-transparent border-transparent text-slate-700 hover:bg-slate-200/75 hover:text-slate-900 dark:text-[#f1f2f3] dark:hover:bg-white/10 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon3DInbox className="w-7 h-7 shrink-0" ringClass={activeTab === 'inbox' ? 'ring-1 ring-white/40' : ''} />
            <span>کارتابل ورودی</span>
          </div>
          {inbox.filter(item => (item.actionState || 'Pending').toLowerCase() === 'pending').length > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'inbox' ? 'bg-white/25 text-white' : 'bg-[#1a8aec] text-white'
            }`}>
              {inbox.filter(item => (item.actionState || 'Pending').toLowerCase() === 'pending').length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleItemClick('outbox')}
          className={getNavClass('outbox')}
        >
          <Icon3DOutbox className="w-7 h-7 shrink-0" ringClass={activeTab === 'outbox' ? 'ring-1 ring-white/40' : ''} />
          <span>پیگیری درخواست‌ها</span>
        </button>

        <button
          onClick={() => handleItemClick('cc-inbox')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer border-0 ${
            activeTab === 'cc-inbox'
              ? 'bg-[#1a8aec] text-white font-bold shadow-md shadow-blue-500/20'
              : 'bg-transparent border-transparent text-slate-700 hover:bg-slate-200/75 hover:text-slate-900 dark:text-[#f1f2f3] dark:hover:bg-white/10 dark:hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Icon3DCc className="w-7 h-7 shrink-0" ringClass={activeTab === 'cc-inbox' ? 'ring-1 ring-white/40' : ''} />
            <span>رونوشت‌های من (CC)</span>
          </div>
          {ccInbox.length > 0 && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'cc-inbox' ? 'bg-white/25 text-white' : 'bg-slate-500 text-white'
            }`}>
              {ccInbox.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleItemClick('forms')}
          className={getNavClass('forms')}
        >
          <Icon3DForms className="w-7 h-7 shrink-0" ringClass={activeTab === 'forms' ? 'ring-1 ring-white/40' : ''} />
          <span>کاتالوگ فرم‌ها</span>
        </button>

        {(user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
          <button
            onClick={() => handleItemClick('reports')}
            className={getNavClass('reports')}
          >
            <Icon3DReports className="w-7 h-7 shrink-0" ringClass={activeTab === 'reports' ? 'ring-1 ring-white/40' : ''} />
            <span>گزارش‌ها و تحلیل‌ها</span>
          </button>
        )}

        {(user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-[#4e73a0]/30">
            <div className="text-xs font-bold text-slate-400 dark:text-[#b0b8c8] px-3.5 mb-2">طراحی و فرآیندها</div>
            <button
              onClick={() => handleItemClick('builder', () => {
                setEditingFormId(null);
                setFormTitle('فرم سازمانی جدید');
                setFormDesc('توضیحات و راهنمای تکمیل فرم...');
                setFormIsPublic(false);
                setHasPublicDeadline(false);
                setPublicCloseDate('');
                setPublicCloseTime('23:59');
                setValidationRules([]);
                setWorkflowSteps([]);
                setDefaultCcUserIds([]);
                setDefaultCcGroupIds([]);
              })}
              className={getNavClass('builder')}
            >
              <Icon3DBuilder className="w-7 h-7 shrink-0" ringClass={activeTab === 'builder' ? 'ring-1 ring-white/40' : ''} />
              <span>طراحی فرم جدید (Visual)</span>
            </button>
          </div>
        )}

        {user.roles?.includes('Admin') && (
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-[#4e73a0]/30 space-y-1.5">
            <div className="text-xs font-bold text-slate-400 dark:text-[#b0b8c8] px-3.5 mb-2">مدیریت کلان (Admin)</div>

            <button
              onClick={() => handleItemClick('oversight', () => {
                api.get('/workflow/admin/all-tasks')
                  .then(res => setAllPendingTasks(res.data || []))
                  .catch(err => toast.error(err.response?.data?.message || 'خطا در دریافت لیست کارتابل‌ها'));
              })}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition cursor-pointer border-0 ${
                activeTab === 'oversight'
                  ? 'bg-[#1a8aec] text-white font-bold shadow-md shadow-blue-500/20'
                  : 'bg-transparent border-transparent text-slate-700 hover:bg-slate-200/75 hover:text-slate-900 dark:text-[#f1f2f3] dark:hover:bg-white/10 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon3DOversight className="w-7 h-7 shrink-0" ringClass={activeTab === 'oversight' ? 'ring-1 ring-white/40' : ''} />
                <span>نظارت بر کارتابل‌ها</span>
              </div>
              {allPendingTasks.length > 0 && <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full">{allPendingTasks.length}</span>}
            </button>

            <button
              onClick={() => handleItemClick('users-management')}
              className={getNavClass('users-management')}
            >
              <Icon3DUsers className="w-7 h-7 shrink-0" ringClass={activeTab === 'users-management' ? 'ring-1 ring-white/40' : ''} />
              <span>مدیریت کاربران و نقش‌ها</span>
            </button>

            <button
              onClick={() => handleItemClick('groups-management')}
              className={getNavClass('groups-management')}
            >
              <Icon3DGroups className="w-7 h-7 shrink-0" ringClass={activeTab === 'groups-management' ? 'ring-1 ring-white/40' : ''} />
              <span>گروه‌های سازمانی</span>
            </button>

            <button
              onClick={() => handleItemClick('master-data')}
              className={getNavClass('master-data')}
            >
              <Icon3DMasterData className="w-7 h-7 shrink-0" ringClass={activeTab === 'master-data' ? 'ring-1 ring-white/40' : ''} />
              <span className="text-right flex-1 leading-snug">بانک داده‌های مرجع (Hub)</span>
            </button>

            <button
              onClick={() => handleItemClick('ai-settings')}
              className={getNavClass('ai-settings')}
            >
              <Icon3DAi className="w-7 h-7 shrink-0" ringClass={activeTab === 'ai-settings' ? 'ring-1 ring-white/40' : ''} />
              <span className="text-right flex-1 leading-snug">تنظیمات و استودیوی هوش مصنوعی</span>
              {!isAiEnabled && (
                <Lock className="w-4 h-4 text-amber-500 shrink-0 ml-1" title="ماژول غیرفعال در لایسنس فعلی" />
              )}
            </button>

            <button
              onClick={() => handleItemClick('backup-restore')}
              className={getNavClass('backup-restore')}
            >
              {/* در مد تاریک آیکن سه‌بعدی و در مد روشن آیکن دوبعدی هماهنگ با پالت */}
              <span className="hidden dark:inline-flex">
                <Icon3DBackupRestore
                  className="w-7 h-7 shrink-0"
                  ringClass={activeTab === 'backup-restore' ? 'ring-1 ring-white/40' : ''}
                />
              </span>
              <span className={`dark:hidden inline-flex items-center justify-center w-7 h-7 rounded-xl transition ${
                activeTab === 'backup-restore' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'
              }`}>
                <DatabaseBackup className="w-4 h-4 shrink-0" />
              </span>
              <span className="text-right flex-1 leading-snug">پشتیبان‌گیری و بازیابی</span>
            </button>

            <button
              onClick={() => handleItemClick('settings')}
              className={getNavClass('settings')}
            >
              <Icon3DSettings className="w-7 h-7 shrink-0" ringClass={activeTab === 'settings' ? 'ring-1 ring-white/40' : ''} />
              <span className="text-right flex-1 leading-snug">تنظیمات سامانه</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#181926] flex flex-col font-sans transition-colors">
      <header className="bg-white dark:bg-[#1e2030] border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 transition-colors">
        <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* دکمه منوی همبرگری برای موبایل و تبلت (lg:hidden) */}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              className="lg:hidden p-2 -mr-1 rounded-xl text-slate-600 dark:text-[#b0b8c8] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#333645] transition focus:outline-none cursor-pointer"
              title="منوی ناوبری"
              aria-label="منوی ناوبری"
            >
              {drawerOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <img 
              src={branding.logoUrl || "/branding/Logo.png"} 
              alt="NovaFlow" 
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain bg-transparent shrink-0" 
              onError={(e) => { e.target.src = '/branding/Logo.png'; }} 
            />
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-tight truncate max-w-[130px] sm:max-w-xs md:max-w-none">
                نوافلو
              </h2>
              {/* زیر عنوان فرعی هدر */}
              <span className="text-[11px] text-slate-400 hidden sm:block">NovaFlow • سامانه هوشمند فرآیندها</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* دکمه اسکنر بارکد و QR مخصوص موبایل (دقیقاً کنار دکمه تم و مخفی در دسکتاپ) */}
            <button
              type="button"
              onClick={() => setMobileScannerOpen(true)}
              title="اسکنر بارکد و QR"
              aria-label="اسکنر بارکد و QR"
              className="md:hidden flex items-center justify-center px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#252736] text-blue-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer shadow-xs"
            >
              <ScanLine className="w-4 h-4 shrink-0" />
            </button>

            {/* دکمه سوییچ تم شکیل ۳ حالته: روشن، تاریک، سیستم */}
            <button
              type="button"
              onClick={cycleTheme}
              title={`حالت تم: ${theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم (پیروی از سیستم‌عامل)'} (جهت تغییر کلیک کنید)`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#252736] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#333645] transition text-xs font-medium cursor-pointer shadow-xs"
            >
              {theme === 'dark' && <Moon className="w-4 h-4 text-blue-500 shrink-0" />}
              {theme === 'light' && <Sun className="w-4 h-4 text-amber-500 shrink-0" />}
              {theme === 'system' && <Monitor className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />}
              <span className="hidden sm:inline">
                {theme === 'dark' ? 'تاریک' : theme === 'light' ? 'روشن' : 'سیستم'}
              </span>
            </button>

            <div className="text-left hidden sm:block">
              <div className="font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                {user.displayName || user.username}
              </div>
              <div className="text-[11px] text-blue-600 dark:text-[#38bdf8] font-medium hidden md:block truncate max-w-[150px]">
                {user.roles?.join(', ')}
              </div>
            </div>

            <button 
              onClick={handleLogout} 
              title="خروج از سامانه" 
              className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer"
            >
              <Icon3DLogout className="w-7 h-7 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* منوی کشویی (Slide-over Drawer) با انیمیشن نرم دوطرفه باز و بسته شدن */}
      <div
        className={`fixed inset-0 z-50 lg:hidden overflow-x-hidden transition-all duration-300 ${
          drawerOpen ? 'pointer-events-auto visible' : 'pointer-events-none invisible'
        }`}
        role="dialog"
        aria-modal="true"
      >
        {/* پس‌زمینه نیمه‌شفاف تیره با انیمیشن محو و ظاهر شدن نرم */}
        <div
          className={`fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ease-in-out ${
            drawerOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />

        {/* پنل کشویی ناوبری از سمت راست با انیمیشن نرم translate-x */}
        <div
          className={`fixed inset-y-0 right-0 w-80 max-w-[88vw] bg-white dark:bg-[#252736] shadow-2xl flex flex-col z-50 border-l border-slate-200 dark:border-[#4e73a0]/40 transition-transform duration-300 ease-out transform ${
            drawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* هدر کشو */}
          <div className="p-4 border-b border-slate-200 dark:border-[#4e73a0]/30 flex items-center justify-between bg-slate-50 dark:bg-[#252736]">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={branding.logoUrl || "/branding/Logo.png"}
                alt="NovaFlow"
                className="w-8 h-8 object-contain bg-transparent shrink-0"
                onError={(e) => { e.target.src = '/branding/Logo.png'; }}
              />
              <div className="min-w-0">
                <h3 className="font-bold text-slate-800 dark:text-[#f1f2f3] text-sm leading-tight truncate">
                  نوافلو
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-[#b0b8c8] block">NovaFlow • سامانه هوشمند فرآیندها</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-[#f1f2f3] hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer shrink-0"
              aria-label="بستن منو"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* لیست تب‌های ناوبری ۳بعدی (بسته شدن خودکار پس از انتخاب تب) */}
          <div className="flex-1 overflow-y-auto p-4 pe-3">
            {renderNavItems(() => setDrawerOpen(false))}
          </div>

          {/* فوتر کشو حاوی اطلاعات کاربر و خروج */}
          <div className="p-4 pe-3 border-t border-slate-200 dark:border-[#4e73a0]/30 bg-slate-50 dark:bg-[#1f2130] flex items-center justify-between gap-2">
            <div className="text-right min-w-0 flex-1 pe-3">
              <div className="font-semibold text-xs text-slate-700 dark:text-[#f1f2f3] leading-snug break-words">
                {user.displayName || user.username}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-[#38bdf8] leading-snug break-words">
                {user.roles?.join(', ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                handleLogout();
              }}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Icon3DLogout className="w-6 h-6 shrink-0" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6 w-full flex-1 flex gap-6">
        {/* سایدبار ثابت سمت راست: در کمتر از دسکتاپ مخفی می‌شود (lg:hidden) */}
        <aside className="hidden lg:block w-64 bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 h-fit space-y-1 shrink-0">
          {renderNavItems()}
        </aside>

        {/* محتوای اصلی */}
        <main className="flex-1 min-w-0 min-h-[550px]">
          {/* تب‌های ماژولار کارتابل: ورودی، پیگیری درخواست‌ها و رونوشت‌های من */}
          {['inbox', 'outbox', 'cc-inbox'].includes(activeTab) && (
            <CartableTabs
              key={`${activeTab}_${tabRefreshNonce}`}
              activeTab={activeTab}
              inbox={inbox}
              outbox={outbox}
              ccInbox={ccInbox}
              forms={forms}
              user={user}
              branding={branding}
              onRefresh={fetchData}
              onTransition={handleTransition}
              onOpenDelegationModal={() => setDelegationModalOpen(true)}
              activeDelegation={activeDelegation}
              onCancelDelegation={async () => {
                await api.delete('/workflow/delegate');
                setActiveDelegation(null);
                toast.success('تفویض کارتابل لغو شد.');
              }}
              onNavigateToForms={() => setActiveTab('forms')}
              externalSearchRequest={cartableExternalSearch}
            />
          )}

          {/* تب کاتالوگ فرم‌ها */}
          {activeTab === 'forms' && (
            <FormsCatalogTab
              key={`forms_${tabRefreshNonce}`}
              forms={forms}
              user={user}
              usersList={usersList}
              fetchData={fetchData}
              onOpenRunner={handleOpenRunner}
              onCopyPublicLink={handleCopyPublicLink}
              onExportFormSchema={handleExportFormSchema}
              onCloneForm={handleCloneForm}
              onCloneAsIndependentForm={handleCloneAsIndependentForm}
              onToggleStatus={handleToggleStatus}
              onDeleteForm={handleDeleteForm}
              onInspectForm={(form) => {
                setInspectTab('visual');
                setInspectFormModal(form);
              }}
              onAdminApproveForm={handleAdminApproveForm}
              onAdminRejectForm={handleAdminRejectForm}
            />
          )}

          {/* تب اختصاصی گزارش‌ها و تحلیل‌ها */}
          {activeTab === 'reports' && (user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
            <ErrorBoundary title="بخش گزارش‌ها و تحلیل‌ها">
              <ReportsTab
                key={`reports_${tabRefreshNonce}`}
                forms={forms}
                user={user}
                branding={branding}
                onFormUpdated={fetchData}
              />
            </ErrorBoundary>
          )}

          {/* تب فرم‌ساز بصری و گردش‌کار */}
          {activeTab === 'builder' && (user.roles?.includes('Admin') || user.roles?.includes('SuperUser')) && (
            <ErrorBoundary title="بخش طراحی فرم">
              <FormBuilderTab
                user={user}
                forms={forms}
                branding={branding}
                logoPreview={logoPreview}
                groups={groups}
                usersList={usersList}
                editingFormId={editingFormId}
                setEditingFormId={setEditingFormId}
                formTitle={formTitle}
                setFormTitle={setFormTitle}
                formDesc={formDesc}
                setFormDesc={setFormDesc}
                showLogoInForm={showLogoInForm}
                setShowLogoInForm={setShowLogoInForm}
                formIsPublic={formIsPublic}
                setFormIsPublic={setFormIsPublic}
                hasPublicDeadline={hasPublicDeadline}
                setHasPublicDeadline={setHasPublicDeadline}
                publicCloseDate={publicCloseDate}
                setPublicCloseDate={setPublicCloseDate}
                publicCloseTime={publicCloseTime}
                setPublicCloseTime={setPublicCloseTime}
                selectedGroups={selectedGroups}
                setSelectedGroups={setSelectedGroups}
                activeCardId={activeCardId}
                setActiveCardId={setActiveCardId}
                sections={sections}
                setSections={setSections}
                printTemplates={formPrintTemplates}
                setPrintTemplates={setFormPrintTemplates}
                validationRules={validationRules}
                setValidationRules={setValidationRules}
                workflowSteps={workflowSteps}
                setWorkflowSteps={setWorkflowSteps}
                defaultCcUserIds={defaultCcUserIds}
                setDefaultCcUserIds={setDefaultCcUserIds}
                defaultCcGroupIds={defaultCcGroupIds}
                setDefaultCcGroupIds={setDefaultCcGroupIds}
                savingForm={savingForm}
                onSaveAndPublish={handleSaveAndPublishForm}
                onCloneAsIndependentForm={handleCloneAsIndependentForm}
                onImportFormSchema={handleImportFormSchema}
                onOpenPreview={() => {
                  setPreviewSecIdx(0);
                  setPreviewData({});
                  setPreviewOpen(true);
                }}
              />
            </ErrorBoundary>
          )}

          {/* تب‌های مدیریت ادمین: نظارت کارتابل‌ها، مدیریت کاربران و گروه‌ها */}
          {['oversight', 'users-management', 'groups-management'].includes(activeTab) && user.roles?.includes('Admin') && (
            <AdminManagementTabs
              key={`${activeTab}_${tabRefreshNonce}`}
              activeTab={activeTab}
              user={user}
              usersList={usersList}
              groups={groups}
              forms={forms}
              distinctFormTitles={distinctFormTitles}
              allPendingTasks={allPendingTasks}
              fetchData={fetchData}
              adSettings={adSettings}
              securityPolicy={securityPolicy}
            />
          )}

          {/* تب تنظیمات و استودیوی هوش مصنوعی */}
          {activeTab === 'ai-settings' && user.roles?.includes('Admin') && (
            isAiEnabled ? (
              <AiStudioTab key={`ai_${tabRefreshNonce}`} forms={forms} />
            ) : (
              <div className="bg-white dark:bg-[#252736] rounded-3xl border border-slate-200/80 dark:border-slate-800 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-sm my-10 animate-in fade-in">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-500 mx-auto flex items-center justify-center mb-4">
                  <Lock className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                  ماژول هوش مصنوعی (AI) در لایسنس فعلی غیرفعال است
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
                  قابلیت‌های استودیوی هوش مصنوعی، ارتباط با مدل‌های زبانی محلی/ابری و استخراج هوشمند کوئری در نسخه آزمایشی یا لایسنس‌های بدون ماژول AI در دسترس نمی‌باشد. برای ارتقا و فعال‌سازی این قابلیت، لطفاً کلید لایسنس جدید تهیه فرمایید.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shadow-sm cursor-pointer"
                >
                  <Icon3DSettings className="w-5 h-5 shrink-0" />
                  <span>مدیریت لایسنس</span>
                </button>
              </div>
            )
          )}

          {/* تب اختصاصی بانک داده‌های مرجع (Master Data Hub) */}
          {activeTab === 'master-data' && user.roles?.includes('Admin') && (
            <MasterDataHubTab key={`masterdata_${tabRefreshNonce}`} user={user} />
          )}

          {/* تب اختصاصی پشتیبان‌گیری و بازیابی */}
          {activeTab === 'backup-restore' && user.roles?.includes('Admin') && (
            <BackupRestoreTab key={`backup_${tabRefreshNonce}`} user={user} />
          )}

          {/* تب تنظیمات سامانه، برندینگ و اعلان‌ها */}
          {activeTab === 'settings' && user.roles?.includes('Admin') && (
            <SystemSettingsTab
              key={`settings_${tabRefreshNonce}`}
              user={user}
              emailSettings={emailSettings}
              setEmailSettings={setEmailSettings}
              adSettings={adSettings}
              setAdSettings={setAdSettings}
              branding={branding}
              setBranding={setBranding}
              logoPreview={logoPreview}
              setLogoPreview={setLogoPreview}
              sessionTimeoutMinutes={sessionTimeoutMinutes}
              setSessionTimeoutMinutes={setSessionTimeoutMinutes}
              securityPolicy={securityPolicy}
              setSecurityPolicy={setSecurityPolicy}
              setToken={setToken}
            />
          )}
        </main>
      </div>

      {/* مودال پیش‌نمایش زنده در فرم‌ساز */}
      {previewOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-1.5 sm:p-4">
          <div className="bg-white dark:bg-[#1e2030] w-[98vw] sm:w-[95vw] md:w-[90vw] h-[95vh] sm:h-[92vh] md:h-[90vh] max-w-[1650px] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in border border-slate-200 dark:border-slate-800">
            <div className="px-3 py-2.5 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#181926]">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                {showLogoInForm && (logoPreview || branding.logoUrl) ? (
                  <img
                    src={logoPreview || branding.logoUrl}
                    alt="Logo"
                    className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <Eye className="w-5 h-5 text-blue-600 dark:text-sky-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="text-[10px] text-blue-600 dark:text-sky-400 font-bold block">پیش‌نمایش زنده فرم</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm truncate block">{formTitle}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer shrink-0"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-3 sm:space-y-6 bg-slate-50/50 dark:bg-[#1e2030]">
              {formIsPublic && hasPublicDeadline && publicCloseDate && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      مهلت تکمیل و ارسال فرم: تا تاریخ <b className="font-mono">{publicCloseDate}</b> ساعت <b className="font-mono">{publicCloseTime || '23:59'}</b>
                    </span>
                  </div>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold shrink-0">زمان‌دار</span>
                </div>
              )}

              {sections[previewSecIdx] && (
                <>
                  <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm">
                    <span className="text-[11px] sm:text-xs text-blue-100 font-bold block mb-0.5 sm:mb-1">
                      مرحله {previewSecIdx + 1} از {sections.length}
                    </span>
                    <h4 className="font-bold text-white text-sm sm:text-base">{sections[previewSecIdx].title}</h4>
                    {sections[previewSecIdx].description && (
                      <p className="text-[11px] sm:text-xs text-blue-100/90 mt-0.5 sm:mt-1 leading-relaxed whitespace-pre-wrap">{sections[previewSecIdx].description}</p>
                    )}
                  </div>

                  <DynamicFormRenderer
                    questions={sections[previewSecIdx].questions}
                    formData={previewData}
                    validationRules={validationRules}
                    allSections={sections}
                    onChange={(fieldOrUpdates, val, extraUpdates) => {
                      setPreviewData(prev => {
                        if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
                          return { ...prev, ...fieldOrUpdates };
                        }
                        const next = { ...prev, [fieldOrUpdates]: val };
                        if (extraUpdates && typeof extraUpdates === 'object') {
                          Object.assign(next, extraUpdates);
                        }
                        return next;
                      });
                    }}
                  />
                </>
              )}
            </div>

            <div className="px-3 py-2.5 sm:px-6 sm:py-4 bg-slate-50 dark:bg-[#181926] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <button
                  type="button"
                  disabled={previewSecIdx === 0}
                  onClick={() => setPreviewSecIdx(previewSecIdx - 1)}
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] sm:border-0 sm:bg-transparent sm:px-0 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  مرحله قبل
                </button>
                <span className="text-xs text-slate-400 font-mono whitespace-nowrap">{previewSecIdx + 1} / {sections.length}</span>
              </div>
              {previewSecIdx < sections.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setPreviewSecIdx(previewSecIdx + 1)}
                  className="w-full sm:w-auto min-h-[40px] whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-xl font-medium cursor-pointer transition"
                >
                  مرحله بعد
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="w-full sm:w-auto min-h-[40px] whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2 rounded-xl font-medium cursor-pointer transition"
                >
                  پایان پیش‌نمایش
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* مودال تفویض کارتابل */}
      {delegationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#252736] w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4 animate-in fade-in border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">تفویض کارتابل به کاربر جانشین</h4>
              <button onClick={() => setDelegationModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">انتخاب همکار جانشین:</label>
                <select
                  value={delegationForm.toUserId}
                  onChange={(e) => setDelegationForm({ ...delegationForm, toUserId: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                >
                  <option value="">-- انتخاب کاربر جانشین --</option>
                  {usersList.filter(u => u.userID !== user.userID && u.isActive === true).map(u => (
                    <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">تاریخ پایان تفویض (شمسی):</label>
                <PersianDatePicker
                  value={delegationForm.endDate}
                  onChange={(val) => setDelegationForm({ ...delegationForm, endDate: val })}
                  placeholder="انتخاب تاریخ پایان..."
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDelegationModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#333645] dark:hover:bg-[#3d4153] text-slate-600 dark:text-slate-300 text-xs py-2.5 rounded-xl font-medium transition cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={!delegationForm.toUserId}
                  onClick={async () => {
                    try {
                      await api.post('/workflow/delegate', {
                        toUserId: parseInt(delegationForm.toUserId, 10),
                        startDate: '',
                        endDate: delegationForm.endDate
                      });
                      toast.success('تفویض کارتابل با موفقیت فعال شد.');
                      setDelegationModalOpen(false);
                      fetchData();
                    } catch (err) {
                      toast.error('خطا در تفویض: ' + err.message);
                    }
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2.5 rounded-xl font-bold transition shadow-sm"
                >
                  فعال‌سازی تفویض
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال تکمیل فرم واقعی کاربری (Form Runner) */}
      {runnerOpen && runnerForm && (
        <div
          id="runner-modal-container"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSubmitRunner(continuousEntryMode);
            }
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-1.5 sm:p-4"
        >
          <div className="bg-white dark:bg-[#1e2030] w-[98vw] sm:w-[95vw] md:w-[90vw] h-[95vh] sm:h-[92vh] md:h-[90vh] max-w-[1650px] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in border border-slate-200 dark:border-slate-800">
            <div className="px-3 py-2.5 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#181926]">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                {runnerForm.parsedSchema?.showLogo !== false && branding.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt="Logo"
                    className="w-8 h-8 sm:w-10 sm:h-10 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <FileText className="w-5 h-5 text-blue-600 dark:text-sky-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base truncate">{runnerForm.title}</span>
                    {runnerForm.isPublic && (
                      <span className="text-[10px] sm:text-[11px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        بدون نیاز به ورود
                      </span>
                    )}
                  </div>
                  {runnerForm.description && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block mt-0.5 line-clamp-1">{runnerForm.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setMobileScannerOpen(true)}
                  title="اسکنر بارکد و QR برای درج سریع در فرم"
                  aria-label="اسکنر بارکد و QR"
                  className="md:hidden flex items-center justify-center p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-blue-600 dark:text-sky-400 hover:bg-slate-100 dark:hover:bg-[#333645] transition cursor-pointer shadow-xs"
                >
                  <ScanLine className="w-4 h-4 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => setRunnerOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-3 sm:space-y-6 bg-slate-50/50 dark:bg-[#1e2030]">
              {runnerToast && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 px-3 py-2 sm:px-4 sm:py-3 rounded-xl text-xs flex items-center justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{typeof runnerToast === 'string' ? runnerToast : runnerToast.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunnerToast(null)}
                    className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 font-bold text-sm px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {(runnerForm.parsedSchema?.publicCloseDate || runnerForm.parsedSchema?.publicExpiresAt) && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      مهلت تکمیل و ارسال فرم: تا تاریخ <b className="font-mono">{runnerForm.parsedSchema.publicCloseDate}</b> ساعت <b className="font-mono">{runnerForm.parsedSchema.publicCloseTime || '23:59'}</b>
                    </span>
                  </div>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold shrink-0">زمان‌دار</span>
                </div>
              )}

              {runnerError && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-3 py-2 sm:px-4 sm:py-3 rounded-xl text-xs flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{runnerError}</span>
                </div>
              )}

              {runnerForm.parsedSchema.sections?.[runnerSecIdx] && (
                <>
                  <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-sm">
                    <span className="text-[11px] sm:text-xs text-blue-100 font-bold block mb-0.5 sm:mb-1">
                      مرحله {runnerSecIdx + 1} از {runnerForm.parsedSchema.sections.length}
                    </span>
                    <h4 className="font-bold text-white text-sm sm:text-base">{runnerForm.parsedSchema.sections[runnerSecIdx].title}</h4>
                    {runnerForm.parsedSchema.sections[runnerSecIdx].description && (
                      <p className="text-[11px] sm:text-xs text-blue-100/90 mt-0.5 sm:mt-1 leading-relaxed whitespace-pre-wrap">{runnerForm.parsedSchema.sections[runnerSecIdx].description}</p>
                    )}
                  </div>

                  <DynamicFormRenderer
                    questions={runnerForm.parsedSchema.sections[runnerSecIdx].questions}
                    formData={runnerData}
                    validationRules={runnerForm.parsedSchema.validationRules || []}
                    allSections={runnerForm.parsedSchema.sections || []}
                    showValidationAlert={false}
                    onChange={(fieldOrUpdates, val, extraUpdates) => {
                      setRunnerError('');
                      setRunnerData(prev => {
                        if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
                          return { ...prev, ...fieldOrUpdates };
                        }
                        const next = { ...prev, [fieldOrUpdates]: val };
                        if (extraUpdates && typeof extraUpdates === 'object') {
                          Object.assign(next, extraUpdates);
                        }
                        return next;
                      });
                    }}
                  />
                </>
              )}
            </div>

            {runnerSecIdx === (runnerForm.parsedSchema.sections?.length || 1) - 1 &&
              runnerValidation.hasRules &&
              !runnerValidation.isValid && (
                <div className="px-2.5 pt-2 pb-1 sm:px-6 sm:pt-3 bg-slate-50 dark:bg-[#181926] border-t border-slate-200 dark:border-slate-800 max-h-28 sm:max-h-none overflow-y-auto">
                  <ValidationRulesAlert validation={runnerValidation} />
                </div>
              )}

            <div className="px-3 py-2.5 sm:px-6 sm:py-4 bg-slate-50 dark:bg-[#181926] border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <button
                  type="button"
                  disabled={runnerSecIdx === 0}
                  onClick={() => setRunnerSecIdx(runnerSecIdx - 1)}
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] sm:border-0 sm:bg-transparent sm:px-0 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  مرحله قبل
                </button>
                <span className="text-xs text-slate-400 font-mono whitespace-nowrap">{runnerSecIdx + 1} / {runnerForm.parsedSchema.sections?.length || 1}</span>
              </div>

              {runnerSecIdx < (runnerForm.parsedSchema.sections?.length || 1) - 1 ? (
                <button
                  type="button"
                  onClick={() => setRunnerSecIdx(runnerSecIdx + 1)}
                  className="w-full sm:w-auto min-h-[40px] whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded-xl font-bold cursor-pointer transition"
                >
                  مرحله بعد
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
                  {!runnerForm.isPublic && (
                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                      <label className="flex items-center justify-center sm:justify-start gap-1.5 cursor-pointer select-none text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 min-h-[40px] px-2.5 py-2 sm:px-0 sm:ml-1 rounded-xl border border-slate-200 dark:border-slate-700 sm:border-0 bg-white dark:bg-[#252736] sm:bg-transparent whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={continuousEntryMode}
                          onChange={(e) => setContinuousEntryMode(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                        />
                        <span>ثبت پیوسته</span>
                      </label>
                      <button
                        type="button"
                        disabled={!runnerValidation.isValid}
                        onClick={() => handleSubmitRunner(true)}
                        className="min-h-[40px] whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-3 sm:px-3.5 py-2 rounded-xl font-bold shadow-sm cursor-pointer transition flex items-center justify-center gap-1.5"
                        title="ثبت این فرم و ورود سریع فرم بعدی بدون خروج (میانبر: کلیدهای ترکیبی در حالت ثبت پیوسته)"
                      >
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span>ثبت و ورود مورد بعدی</span>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!runnerValidation.isValid}
                    onClick={() => handleSubmitRunner(continuousEntryMode)}
                    className="w-full sm:w-auto min-h-[40px] whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-5 py-2 rounded-xl font-bold shadow-md cursor-pointer transition flex items-center justify-center"
                  >
                    ثبت نهایی درخواست
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* مودال بازبینی ساختار فرم و کد JSON توسط ادمین */}
      {inspectFormModal && (() => {
        let parsedSchema = {};
        let formattedJson = '';
        try {
          parsedSchema = JSON.parse(inspectFormModal.schemaJson || '{}');
          formattedJson = JSON.stringify(parsedSchema, null, 2);
        } catch (e) {
          formattedJson = inspectFormModal.schemaJson || '{}';
        }
        const creator = usersList.find(u => u.userID === inspectFormModal.createdByUserID);
        const policy = parsedSchema.workflowPolicy || {};

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#252736] w-full max-w-3xl rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in border border-slate-200 dark:border-slate-700/80">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between bg-slate-50 dark:bg-[#1e2030]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 text-base block">
                      بازبینی فرم: {inspectFormModal.title} (نگارش {inspectFormModal.version}.{inspectFormModal.revision})
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      طراح فرم: <b>{creator ? (creator.displayName || creator.username) : `کاربر #${inspectFormModal.createdByUserID}`}</b>
                    </span>
                  </div>
                </div>
                <button onClick={() => setInspectFormModal(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* تب‌های جابه‌جایی بین نمای ساختار و کد JSON */}
              <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#252736] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectTab('visual')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer ${
                    inspectTab === 'visual' ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-500/10' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  ۱. بررسی بخش‌ها، فیلدها و ماتریس گردش‌کار
                </button>
                <button
                  type="button"
                  onClick={() => setInspectTab('json')}
                  className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition cursor-pointer ${
                    inspectTab === 'json' ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-500/10' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  ۲. کد فنی اسکیما (Schema JSON)
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {inspectTab === 'visual' ? (
                  <>
                    <div className="bg-slate-50 dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                      <div><span className="text-slate-400">توضیحات فرم:</span> <span className="text-slate-700 dark:text-slate-200 font-medium">{inspectFormModal.description || '—'}</span></div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        <span className="bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                          نوع فرم: <b>{parsedSchema.isPublic ? 'نظرسنجی عمومی (بدون لاگین)' : 'فرم فرآیندی سازمانی'}</b>
                        </span>
                        <span className="bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                          نمایش لوگو: <b>{parsedSchema.showLogo !== false ? 'بله' : 'خیر'}</b>
                        </span>
                      </div>
                    </div>

                    {/* بخش‌ها و سوالات */}
                    <div className="space-y-3">
                      <h5 className="font-bold text-xs text-slate-700 dark:text-slate-200">بخش‌ها و فیلدهای تعریف‌شده ({(parsedSchema.sections || []).length} بخش):</h5>
                      {(parsedSchema.sections || []).map((sec, sIdx) => (
                        <div key={sec.sectionId || sIdx} className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2.5 bg-white dark:bg-[#1e2030]">
                          <div className="font-bold text-sm text-blue-700 dark:text-blue-400">{sec.title}</div>
                          <div className="space-y-2">
                            {(sec.questions || []).map((q, qIdx) => (
                              <div key={q.id || qIdx} className="bg-slate-50 dark:bg-[#252736] p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs gap-2">
                                <div>
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">{q.label}</span>
                                  {q.required && <span className="text-rose-500 font-bold mr-1">* (الزامی)</span>}
                                  {q.type === 'label' && <span className="text-[11px] text-blue-600 dark:text-blue-400 mr-2 font-bold">[متن ثابت / لیبل]</span>}
                                  {q.unit && <span className="text-[11px] text-blue-600 dark:text-blue-400 mr-2">[واحد: {q.unit}]</span>}
                                  {q.maxDigits && <span className="text-[11px] text-amber-600 dark:text-amber-400 mr-2">[حداکثر {q.maxDigits} رقم]</span>}
                                  {q.options && q.options.length > 0 && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">گزینه‌ها: {q.options.join(' | ')}</div>
                                  )}
                                </div>
                                <span className="font-mono text-[11px] bg-white dark:bg-[#1e2030] border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0" dir="ltr">
                                  {q.type} ({q.id})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ماتریس گردش کار */}
                    {!parsedSchema.isPublic && (
                      <div className="border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2.5 bg-white dark:bg-[#1e2030]">
                        <h5 className="font-bold text-xs text-slate-700 dark:text-slate-200">ماتریس تاییدات ترتیبی ({(policy.steps || []).length} مرحله):</h5>
                        {(policy.steps || []).length === 0 ? (
                          <div className="text-xs text-slate-500 dark:text-slate-400">ثبت مستقیم (بدون نیاز به تایید)</div>
                        ) : (
                          <div className="space-y-2">
                            {policy.steps.map((st, idx) => (
                              <div key={idx} className="bg-slate-50 dark:bg-[#252736] p-3 rounded-xl border border-slate-100 dark:border-slate-700/80 text-xs space-y-1">
                                <div className="font-bold text-slate-800 dark:text-slate-100">گام {idx + 1}: {st.stepName}</div>
                                <div className="text-slate-600 dark:text-slate-300">
                                  تاییدکنندگان: {(st.approvers || []).map(a => {
                                    if (a.type === 'Group') return groups.find(g => (g.groupID || g.groupId) == a.id)?.groupName || `گروه ${a.id}`;
                                    return usersList.find(u => u.userID == a.id)?.displayName || `کاربر ${a.id}`;
                                  }).join('، ') || 'تعیین نشده'}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  قاعده: {st.approvalRule === 'ALL' ? 'تایید همگانی' : 'تایید اولویت‌دار'}
                                  {st.conditionField ? ` | شرط: ${st.conditionField} ${st.conditionOperator} ${st.conditionValue}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">ساختار خام اسکیما (SchemaJSON):</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(formattedJson);
                            toast.success('کد JSON در حافظه کپی شد.');
                          } catch {
                            toast.error('امکان دسترسی خودکار به کلیپ‌بورد وجود ندارد.');
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg font-bold cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>کپی کد JSON</span>
                      </button>
                    </div>
                    <pre dir="ltr" className="bg-slate-900 text-emerald-300 p-4 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed text-left max-h-[420px]">
                      {formattedJson}
                    </pre>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-[#1e2030] border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setInspectFormModal(null)}
                  className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs px-4 py-2.5 rounded-xl font-bold cursor-pointer"
                >
                  بستن
                </button>
                {inspectFormModal.status === 'PendingApproval' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = inspectFormModal;
                        setInspectFormModal(null);
                        handleAdminRejectForm(target);
                      }}
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>رد فرم</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = inspectFormModal;
                        setInspectFormModal(null);
                        handleAdminApproveForm(target);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>تایید و فعال‌سازی فرم</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* مودال اسکنر بارکد و QR موبایل */}
      <MobileBarcodeScannerModal
        isOpen={mobileScannerOpen}
        onClose={() => setMobileScannerOpen(false)}
        hasActiveForm={Boolean(
          runnerOpen ||
          previewOpen ||
          (typeof document !== 'undefined' &&
            document.querySelector('[data-dynamic-form-renderer="editable"], [data-master-lookup-search="true"]'))
        )}
        onInsertToActiveForm={handleInsertScannedToActiveForm}
        onSearchInCartable={handleSearchScannedInCartable}
        onOpenSubmission={handleOpenScannedSubmission}
        onOpenAttachments={handleOpenScannedAttachments}
      />
    </div>
  );
}

export default function App() {
  return (
    <GlobalDialogProvider>
      <AppContent />
    </GlobalDialogProvider>
  );
}
