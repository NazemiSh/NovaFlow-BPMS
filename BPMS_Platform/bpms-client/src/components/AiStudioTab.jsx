import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { useDialog } from './GlobalDialogProvider';
import { 
  Sparkles, Bot, Plus, Trash2, Edit3, RefreshCw, Copy, Check, 
  Search, Filter, CheckCircle2, ChevronDown, Database, Code, 
  Layers, AlertCircle, X, Cpu, Server, Key, Sliders, Globe, Building2
} from 'lucide-react';

function extractFields(schemaInput) {
  if (!schemaInput) return [];
  try {
    const data = typeof schemaInput === 'string' ? JSON.parse(schemaInput) : schemaInput;
    if (!data || typeof data !== 'object') return [];

    const fields = [];
    const seen = new Set();

    const addField = (q, secTitle = '') => {
      if (!q || typeof q !== 'object') return;
      const id = q.id || q.name || q.key || q.fieldId || '';
      const label = q.label || q.title || q.name || q.text || id || 'بدون برچسب';
      const type = q.type || 'text';

      const uniqueKey = `${id}:::${label}`;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);

      fields.push({
        id: id || label,
        label: label,
        type: type,
        section: secTitle || ''
      });
    };

    // 1. sections array -> questions or fields
    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach(sec => {
        if (!sec || typeof sec !== 'object') return;
        const secTitle = sec.title || sec.name || '';
        const items = sec.questions || sec.fields || [];
        if (Array.isArray(items)) {
          items.forEach(q => addField(q, secTitle));
        }
      });
    }

    // 2. Direct questions or fields on root object
    if (data.questions && Array.isArray(data.questions)) {
      data.questions.forEach(q => addField(q, ''));
    }
    if (data.fields && Array.isArray(data.fields)) {
      data.fields.forEach(q => addField(q, ''));
    }

    // 3. If schema itself is an array of sections or fields
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (item.questions && Array.isArray(item.questions)) {
          item.questions.forEach(q => addField(q, item.title || ''));
        } else if (item.fields && Array.isArray(item.fields)) {
          item.fields.forEach(q => addField(q, item.title || ''));
        } else {
          addField(item, '');
        }
      });
    }

    return fields;
  } catch (err) {
    console.error('Error parsing schema JSON:', err);
    return [];
  }
}

const DEFAULT_SYSTEM_PROMPT = `شما معمار ارشد پایگاه‌داده Microsoft SQL Server و متخصص هوش تجاری (BI) در سامانه فرم‌ساز سازمانی BPMS هستید.
وظیفه شما:
1. تحلیل دقیق اسکیمای فرم‌ها و نگارش‌های انتخابی (FormID و Version.Revision).
2. استخراج مقادیر فیلدهای ذخیره‌شده در ستون DataJSON جدول dbo.FormSubmissions با استفاده از تابع JSON_VALUE(DataJSON, '$.field_id').
3. برای فیلدهای جدول اقلام یا چندسطری (repeater_grid و table)، اقلام به صورت آرایه JSON در DataJSON ذخیره می‌شوند. جهت استخراج، گزارش‌گیری، فیلتر یا جمع‌بندی مقادیر اقلام (مانند SUM تعداد، مبالغ یا شمارش اقلام)، حتماً از ساختار CROSS APPLY OPENJSON(s.DataJSON, '$.field_id') WITH (...) استفاده فرمایید.
4. پیاده‌سازی اتصالات (JOIN)، تجمیع‌ها (Aggregations) و فیلترهای زمانی و سازمانی بین فرم‌های مختلف بر اساس نیازمندی کاربر.
5. تولید کوئری‌های بهینه T-SQL و ایجاد CREATE OR ALTER VIEW اختصاصی جهت ایمپورت مستقیم در Power BI.
6. ارائه توضیحات ساختاریافته، دقیق و روان به زبان فارسی پیرامون منطق کوئری و نحوه ارتباط جداول.`;

export default function AiStudioTab({ forms = [] }) {
  const { toast, confirm } = useDialog();
  // ----------------------------------------------------
  // SECTION 1: Multi-Provider AI Services State
  // ----------------------------------------------------
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  const [editingProvider, setEditingProvider] = useState({
    id: '',
    providerName: '',
    baseUrl: '',
    apiKey: '',
    modelName: '',
    temperature: 0.2,
    maxTokens: 2000,
    isActive: false,
    systemPrompt: DEFAULT_SYSTEM_PROMPT
  });

  const [fetchedModels, setFetchedModels] = useState([]);
  const [modelFilter, setModelFilter] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchModelError, setFetchModelError] = useState('');

  // ----------------------------------------------------
  // SECTION 2: AI Multi-Form Query Studio State
  // ----------------------------------------------------
  const [formSearch, setFormSearch] = useState('');
  const [formStatusFilter, setFormStatusFilter] = useState('all'); // 'all', 'published', 'draft'
  const [formTypeFilter, setFormTypeFilter] = useState('all'); // 'all', 'internal', 'public'
  
  // Mapping: { [formTitle]: formID }
  const [selectedFormVersions, setSelectedFormVersions] = useState({});
  const [formSchemasCache, setFormSchemasCache] = useState({});

  const [aiUserPrompt, setAiUserPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiQueryResult, setAiQueryResult] = useState(null);
  const [copiedQuery, setCopiedQuery] = useState(false);

  // ----------------------------------------------------
  // Load Providers on Mount
  // ----------------------------------------------------
  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    setLoadingProviders(true);
    try {
      const res = await api.get('/admin/ai/providers');
      setProviders(res.data || []);
    } catch (err) {
      console.error('Error loading AI providers:', err);
    } finally {
      setLoadingProviders(false);
    }
  };

  const handleSetActiveProvider = async (id) => {
    try {
      const res = await api.post(`/admin/ai/providers/set-active/${id}`);
      if (res.data?.providers) {
        setProviders(res.data.providers);
      } else {
        setProviders(prev => prev.map(p => ({ ...p, isActive: p.id === id })));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در فعال‌سازی سرویس هوش مصنوعی.');
    }
  };

  const handleDeleteProvider = async (id, name) => {
    const confirmed = await confirm({
      title: 'حذف سرویس هوش مصنوعی',
      message: `آیا از حذف سرویس «${name || 'انتخاب‌شده'}» اطمینان دارید؟`,
      confirmText: 'تایید و حذف',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      const res = await api.delete(`/admin/ai/providers/${id}`);
      if (res.data?.providers) {
        setProviders(res.data.providers);
      } else {
        setProviders(prev => prev.filter(p => p.id !== id));
      }
      if (editingProvider?.id === id) {
        setShowProviderForm(false);
      }
      toast.success('سرویس هوش مصنوعی با موفقیت حذف شد.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در حذف سرویس.');
    }
  };

  const handleOpenNewProvider = () => {
    setEditingProvider({
      id: '',
      providerName: '',
      baseUrl: '',
      apiKey: '',
      modelName: '',
      temperature: 0.2,
      maxTokens: 2000,
      isActive: providers.length === 0,
      systemPrompt: DEFAULT_SYSTEM_PROMPT
    });
    setFetchedModels([]);
    setModelFilter('');
    setFetchModelError('');
    setShowProviderForm(true);
  };

  const handleOpenEditProvider = (p) => {
    setEditingProvider({
      ...p,
      systemPrompt: p.systemPrompt || DEFAULT_SYSTEM_PROMPT
    });
    setFetchedModels([]);
    setModelFilter('');
    setFetchModelError('');
    setShowProviderForm(true);
  };

  const handleFetchModels = async () => {
    if (!editingProvider.baseUrl?.trim()) {
      setFetchModelError('لطفاً ابتدا آدرس Base URL را وارد کنید.');
      return;
    }
    setLoadingModels(true);
    setFetchModelError('');
    try {
      const res = await api.post('/admin/ai/fetch-models', {
        baseUrl: editingProvider.baseUrl,
        apiKey: editingProvider.apiKey
      });
      const models = Array.isArray(res.data) ? res.data : (res.data?.models || []);
      setFetchedModels(models);
      if (models.length === 0) {
        setFetchModelError('هیچ مدلی از آدرس ارائه‌شده دریافت نشد.');
      }
    } catch (err) {
      let errMsg = 'خطا در دریافت لیست مدل‌ها از سرویس.';
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          errMsg = err.response.data;
        } else if (err.response.data.message) {
          errMsg = err.response.data.message;
        } else if (err.response.data.Message) {
          errMsg = err.response.data.Message;
        }
      } else if (err.message) {
        errMsg = err.message;
      }
      setFetchModelError(errMsg);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveProvider = async (e) => {
    e.preventDefault();
    if (!editingProvider.providerName.trim()) {
      toast.warning('لطفاً نام سرویس را وارد کنید.');
      return;
    }
    if (!editingProvider.baseUrl.trim()) {
      toast.warning('لطفاً آدرس Base URL را وارد کنید.');
      return;
    }
    setSavingProvider(true);
    try {
      const res = await api.post('/admin/ai/providers', editingProvider);
      if (res.data?.providers) {
        setProviders(res.data.providers);
      } else {
        await loadProviders();
      }
      setShowProviderForm(false);
      toast.success('سرویس هوش مصنوعی با موفقیت ذخیره شد.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره سرویس هوش مصنوعی.');
    } finally {
      setSavingProvider(false);
    }
  };

  const filteredModels = useMemo(() => {
    if (!modelFilter.trim()) return fetchedModels;
    return fetchedModels.filter(m => m.toLowerCase().includes(modelFilter.toLowerCase().trim()));
  }, [fetchedModels, modelFilter]);

  // ----------------------------------------------------
  // Group Forms by Title
  // ----------------------------------------------------
  const groupedForms = useMemo(() => {
    const map = {};
    (forms || []).forEach(f => {
      const title = f.title || 'بدون عنوان';
      if (!map[title]) {
        map[title] = [];
      }
      map[title].push(f);
    });

    // Sort versions descending
    Object.keys(map).forEach(title => {
      map[title].sort((a, b) => {
        if (b.version !== a.version) return b.version - a.version;
        return (b.revision || 0) - (a.revision || 0);
      });
    });

    return map;
  }, [forms]);

  const filteredTitles = useMemo(() => {
    return Object.keys(groupedForms).filter(title => {
      const versions = groupedForms[title];

      // Search filter
      if (formSearch.trim() && !title.toLowerCase().includes(formSearch.toLowerCase().trim())) {
        return false;
      }

      // Status filter
      if (formStatusFilter === 'published' && !versions.some(v => v.status === 'Published')) {
        return false;
      }
      if (formStatusFilter === 'draft' && !versions.some(v => v.status !== 'Published')) {
        return false;
      }

      // Type filter
      if (formTypeFilter === 'public' && !versions.some(v => v.isPublic)) {
        return false;
      }
      if (formTypeFilter === 'internal' && !versions.some(v => !v.isPublic)) {
        return false;
      }

      return true;
    });
  }, [groupedForms, formSearch, formStatusFilter, formTypeFilter]);

  const handleToggleForm = (title) => {
    setSelectedFormVersions(prev => {
      const next = { ...prev };
      if (next[title]) {
        delete next[title];
      } else {
        const versions = groupedForms[title] || [];
        // Default to latest published version or first version
        const publishedVer = versions.find(v => v.status === 'Published');
        const defaultVer = publishedVer || versions[0];
        if (defaultVer) {
          next[title] = Number(defaultVer.formID || defaultVer.id);
        }
      }
      return next;
    });
  };

  const handleVersionChange = (title, formId) => {
    setSelectedFormVersions(prev => ({
      ...prev,
      [title]: Number(formId)
    }));
  };

  // Lazy-load schema from API if a selected form has an empty/unloaded schema
  useEffect(() => {
    Object.values(selectedFormVersions).forEach(fId => {
      if (!fId) return;
      const numId = Number(fId);
      const formObj = (forms || []).find(f => Number(f.formID) === numId || Number(f.id) === numId);
      const hasSchema = formObj && (formObj.schemaJson || formObj.parsedSchema || formObj.schemaJSON);
      if (!hasSchema && !formSchemasCache[numId]) {
        api.get(`/forms/${numId}`).then(res => {
          if (res.data) {
            const raw = res.data.schemaJson || res.data.parsedSchema || res.data.schemaJSON;
            if (raw) {
              setFormSchemasCache(prev => ({ ...prev, [numId]: raw }));
            }
          }
        }).catch(err => console.warn('Could not fetch schema for form', numId, err));
      }
    });
  }, [selectedFormVersions, forms, formSchemasCache]);

  // Selected Forms in Basket
  const basketItems = useMemo(() => {
    return Object.entries(selectedFormVersions).map(([title, formId]) => {
      const numId = Number(formId);
      const formObj = (forms || []).find(f => Number(f.formID) === numId || Number(f.id) === numId);
      if (!formObj) return null;
      const rawSchema = formObj.schemaJson || formObj.parsedSchema || formObj.schemaJSON || formObj.SchemaJSON || formObj.schema || formSchemasCache[numId];
      const fields = extractFields(rawSchema);
      return {
        title,
        formId: numId,
        formObj,
        fields
      };
    }).filter(Boolean);
  }, [selectedFormVersions, forms, formSchemasCache]);

  const handleFieldClick = (field, item) => {
    const fieldName = field.label || field.id;
    // درج عنوان فرم به همراه شماره دقیق نگارش در پرامپت جهت شفافیت حداکثری
    const versionStr = item.formObj?.version != null ? ` (نگارش ${item.formObj.version}.${item.formObj.revision || 0})` : '';
    const tag = `[${item.title}${versionStr}: ${fieldName}]`;
    setAiUserPrompt(prev => {
      if (!prev.trim()) return tag;
      return `${prev} ${tag}`;
    });
  };

  const handleGenerateQuery = async () => {
    const selectedFormIds = Object.values(selectedFormVersions);
    if (selectedFormIds.length === 0) {
      toast.warning('لطفاً حداقل یک فرم را انتخاب کنید.');
      return;
    }
    if (!aiUserPrompt.trim()) {
      toast.warning('لطفاً درخواست یا سوال تحلیلی خود را بنویسید.');
      return;
    }

    setAiLoading(true);
    setAiQueryResult(null);
    try {
      const res = await api.post('/admin/ai/generate-multi-form-query', {
        formIds: selectedFormIds,
        userPrompt: aiUserPrompt
      });
      setAiQueryResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ارتباط با سرور هوش مصنوعی.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyQuery = () => {
    if (aiQueryResult?.sqlQuery) {
      navigator.clipboard.writeText(aiQueryResult.sqlQuery);
      setCopiedQuery(true);
      setTimeout(() => setCopiedQuery(false), 2000);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto pb-16 sm:pb-12 min-w-0">
      {/* ========================================================================= */}
      {/* 1. بخش بالا — لیست سرویس‌های هوش مصنوعی فعال (Multi-Provider) */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 space-y-5 sm:space-y-6 shadow-sm min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg text-white shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
                مدیریت سرویس‌های هوش مصنوعی (Multi-Provider)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تعریف و سوییچ لحظه‌ای بین سرویس‌های محلی یا ابری (Ollama، LiteLLM Proxy، OpenAI، OpenRouter و vLLM)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenNewProvider}
            className="w-full md:w-auto justify-center inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن سرویس جدید</span>
          </button>
        </div>

        {/* نمای کارت عمودی در موبایل (< md) */}
        <div className="md:hidden space-y-3">
          {loadingProviders ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-[#1e2030]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600 dark:text-blue-400" />
              در حال بارگذاری سرویس‌ها...
            </div>
          ) : providers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-600 dark:text-slate-400 leading-relaxed rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-[#1e2030]">
              هنوز هیچ سرویسی تعریف نشده است. بر روی «افزودن سرویس جدید» کلیک کنید.
            </div>
          ) : (
            providers.map(p => (
              <div
                key={p.id}
                className={`p-3.5 rounded-xl border transition space-y-2.5 ${
                  p.isActive
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-[#26293d]'
                    : 'border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1e2030]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
                    <input
                      type="radio"
                      name="activeProviderRadioMobile"
                      checked={p.isActive}
                      onChange={() => handleSetActiveProvider(p.id)}
                      className="w-4 h-4 text-blue-600 accent-blue-600 cursor-pointer shrink-0"
                      title="انتخاب به عنوان سرویس فعال سامانه"
                    />
                    <span className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate">
                      {p.providerName}
                    </span>
                    {p.isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        فعال
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditProvider(p)}
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                      title="ویرایش سرویس"
                      aria-label="ویرایش سرویس"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(p.id, p.providerName)}
                      className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                      title="حذف سرویس"
                      aria-label="حذف سرویس"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">مدل:</span>
                    <span className="font-mono bg-slate-100 dark:bg-[#232536] text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 truncate max-w-[200px]">
                      {p.modelName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">آدرس:</span>
                    <span dir="ltr" className="font-mono text-slate-600 dark:text-slate-300 truncate max-w-[220px]">
                      {p.baseUrl}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* جدول سرویس‌ها در دسکتاپ (>= md) */}
        <div className="hidden md:block w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/80">
          <table className={`w-full text-right text-xs ${providers.length > 0 ? 'min-w-[560px]' : ''}`}>
            <thead className="bg-slate-50 dark:bg-[#1e2030] text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-semibold">
              <tr>
                <th className="py-3 px-4 w-16 text-center whitespace-nowrap">فعال</th>
                <th className="py-3 px-4 whitespace-nowrap">سرویس</th>
                <th className="py-3 px-4 whitespace-nowrap">Base URL</th>
                <th className="py-3 px-4 whitespace-nowrap">مدل انتخابی</th>
                <th className="py-3 px-4 text-center w-28 whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loadingProviders ? (
                <tr>
                  <td colSpan={5} className="py-8 px-3 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                    در حال بارگذاری سرویس‌ها...
                  </td>
                </tr>
              ) : providers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-3 text-center text-slate-600 dark:text-slate-400 leading-relaxed">
                    هنوز هیچ سرویسی تعریف نشده است. بر روی «افزودن سرویس جدید» کلیک کنید.
                  </td>
                </tr>
              ) : (
                providers.map(p => (
                  <tr key={p.id} className={`transition dark:bg-[#1e2030] hover:bg-blue-50/30 dark:hover:bg-[#26293d] ${p.isActive ? 'bg-blue-50/50 dark:bg-[#26293d]' : ''}`}>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="radio"
                        name="activeProviderRadio"
                        checked={p.isActive}
                        onChange={() => handleSetActiveProvider(p.id)}
                        className="w-4 h-4 text-blue-600 accent-blue-600 cursor-pointer"
                        title="انتخاب به عنوان سرویس فعال سامانه"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{p.providerName}</span>
                        {p.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            فعال
                          </span>
                        )}
                      </div>
                    </td>
                    <td dir="ltr" className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300 text-right truncate max-w-xs">
                      {p.baseUrl}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono bg-slate-100 dark:bg-[#232536] text-slate-700 dark:text-slate-200 px-2 py-1 rounded-md text-[11px] border border-slate-200 dark:border-slate-700">
                        {p.modelName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditProvider(p)}
                          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                          title="ویرایش سرویس"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProvider(p.id, p.providerName)}
                          className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="حذف سرویس"
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

        {/* فرم افزودن یا ویرایش سرویس */}
        {showProviderForm && (
          <form onSubmit={handleSaveProvider} className="bg-slate-50 dark:bg-[#1e2030] border border-blue-200 dark:border-blue-800/60 rounded-2xl p-5 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-sm">
                <Sliders className="w-4 h-4" />
                <span>{editingProvider.id ? 'ویرایش سرویس هوش مصنوعی' : 'افزودن سرویس هوش مصنوعی جدید'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowProviderForm(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">نام سرویس / عنوان:</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً: LiteLLM Proxy یا Local Ollama"
                  value={editingProvider.providerName}
                  onChange={(e) => setEditingProvider({ ...editingProvider, providerName: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Base URL:</label>
                <input
                  type="text"
                  dir="ltr"
                  required
                  placeholder="http://localhost:11434/v1 یا https://api.openai.com/v1"
                  value={editingProvider.baseUrl}
                  onChange={(e) => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-left focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">API Key (در صورت نیاز):</label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder="sk-..."
                  value={editingProvider.apiKey || ''}
                  onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-left focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">مدل هوش مصنوعی (Model Name):</label>
                  <button
                    type="button"
                    disabled={loadingModels || !editingProvider.baseUrl}
                    onClick={handleFetchModels}
                    className="text-[11px] text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-500/30 transition cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-300 disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 shrink-0 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
                    <span>{loadingModels ? 'در حال دریافت مدل‌ها...' : 'دریافت مدل‌ها'}</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {/* اگر مدل‌ها با موفقیت دریافت شدند */}
                  {fetchedModels.length > 0 && (
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800/60 space-y-2.5 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{fetchedModels.length} مدل از سرور هوش مصنوعی دریافت شد:</span>
                        </span>
                        {modelFilter && (
                          <span className="text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                            ({filteredModels.length} مورد پیدا شد)
                          </span>
                        )}
                      </div>

                      {/* کادر جستجو و فیلتر در مدل‌ها */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder="جستجو در بین مدل‌های دریافت‌شده..."
                          value={modelFilter}
                          onChange={(e) => setModelFilter(e.target.value)}
                          className="w-full pr-8 pl-7 py-1.5 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-lg border border-blue-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        />
                        {modelFilter && (
                          <button
                            type="button"
                            onClick={() => setModelFilter('')}
                            className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            title="پاک کردن جستجو"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* لیست کشویی انتخاب مدل */}
                      <div>
                        <label className="block text-[10px] font-semibold text-blue-800 dark:text-blue-300 mb-1">
                          یک مدل را از لیست کشویی زیر انتخاب کنید:
                        </label>
                        <select
                          value={editingProvider.modelName}
                          onChange={(e) => {
                            if (e.target.value) {
                              setEditingProvider({ ...editingProvider, modelName: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-[#252736] rounded-xl border border-blue-300 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
                        >
                          <option value="">-- کلیک کنید و مدل مورد نظر را انتخاب نمایید ({filteredModels.length} مدل) --</option>
                          {filteredModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {filteredModels.length === 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          هیچ مدلی با عبارت «{modelFilter}» در لیست وجود ندارد.
                        </p>
                      )}
                    </div>
                  )}

                  {fetchModelError && (
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-[11px] text-rose-600 dark:text-rose-300 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{fetchModelError}</span>
                    </div>
                  )}

                  {/* نام مدل انتخابی (تایپ دستی یا ویرایش) */}
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      نام مدل انتخاب‌شده (امکان تایپ مستقیم یا ویرایش دستی):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      placeholder="نام مدل انتخابی (مانند gpt-4o-mini یا llama3:8b)"
                      value={editingProvider.modelName}
                      onChange={(e) => setEditingProvider({ ...editingProvider, modelName: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono text-left focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* باکس پرامپت سیستمی */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    پرامپت سیستمی (System Prompt):
                  </label>
                  <p className="text-[11px] text-slate-400">
                    دستورالعمل و نقش رفتاری هوش مصنوعی برای تحلیل داده‌های فرم‌ها، تولید کوئری‌های SQL و ایجاد ویوهای Power BI
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingProvider({ ...editingProvider, systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                  className="self-start sm:self-auto text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold flex items-center gap-1 bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-500/30 transition cursor-pointer"
                  title="بازنشانی متن به پرامپت پیش‌فرض سیستم"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>بازنشانی به پرامپت پیش‌فرض</span>
                </button>
              </div>
              <textarea
                rows={6}
                value={editingProvider.systemPrompt || ''}
                onChange={(e) => setEditingProvider({ ...editingProvider, systemPrompt: e.target.value })}
                placeholder="دستورالعمل‌های سیستمی هوش مصنوعی..."
                className="w-full px-3.5 py-2.5 bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-sans focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Temperature:</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1.5"
                  value={editingProvider.temperature}
                  onChange={(e) => setEditingProvider({ ...editingProvider, temperature: parseFloat(e.target.value) || 0.2 })}
                  className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Max Tokens:</label>
                <input
                  type="number"
                  step="100"
                  min="200"
                  max="16000"
                  value={editingProvider.maxTokens}
                  onChange={(e) => setEditingProvider({ ...editingProvider, maxTokens: parseInt(e.target.value, 10) || 2000 })}
                  className="w-full px-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={editingProvider.isActive}
                    onChange={(e) => setEditingProvider({ ...editingProvider, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                  <span>تنظیم به عنوان سرویس فعال سامانه</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowProviderForm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={savingProvider}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 cursor-pointer"
              >
                {savingProvider ? 'در حال ذخیره...' : 'ذخیره سرویس'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. بخش پایین — استودیوی کوئری‌ساز چندفرمی هوش مصنوعی */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-6 space-y-5 sm:space-y-6 shadow-sm min-w-0">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/80 pb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
              استودیوی کوئری‌ساز چندفرمی هوش مصنوعی (AI Multi-Form Cross-Query Studio)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تحلیل و ترکیب داده‌های فرم‌های سازمانی با پشتیبانی کامل از نگارش‌ها (Versions) و تولید خودکار کوئری‌های SQL و View اختصاصی برای Power BI
            </p>
          </div>
        </div>

        {/* نوار جستجو و فیلترها */}
        <div className="bg-slate-50 dark:bg-[#1e2030] p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="جستجوی نام یا عنوان فرم..."
                value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                className="w-full pr-9 pl-3 py-2 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={formStatusFilter}
                onChange={(e) => setFormStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-[#252736] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="published">فقط فرم‌های فعال (منتشر شده)</option>
                <option value="draft">فقط پیش‌نویس</option>
              </select>

              <select
                value={formTypeFilter}
                onChange={(e) => setFormTypeFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-[#252736] rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">همه نوع فرم‌ها</option>
                <option value="internal">فرم‌های سازمانی</option>
                <option value="public">فرم‌های عمومی</option>
              </select>
            </div>
          </div>
        </div>

        {/* لیست فرم‌ها (تجمیعی بر اساس عنوان + انتخاب نگارش) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              ۱. فرم‌های مورد نظر جهت تحلیل و ترکیب را تیک بزنید:
            </label>
            <span className="text-[11px] text-slate-400">
              نمایش {filteredTitles.length} عنوان فرم
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-none md:max-h-60 overflow-visible md:overflow-y-auto p-1">
            {filteredTitles.length === 0 ? (
              <div className="col-span-full py-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-[#1e2030] rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                فرمی مطابق با فیلترهای جستجو یافت نشد.
              </div>
            ) : (
              filteredTitles.map(title => {
                const versions = groupedForms[title] || [];
                const isSelected = Boolean(selectedFormVersions[title]);
                const selectedFormId = selectedFormVersions[title] || versions[0]?.formID;

                return (
                  <div
                    key={title}
                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition ${
                      isSelected 
                        ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700 shadow-xs' 
                        : 'bg-white dark:bg-[#1e2030] border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleForm(title)}
                        className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate" title={title}>
                        {title}
                      </span>
                    </label>

                    {/* منوی کشویی انتخاب نگارش */}
                    <div className="shrink-0">
                      <select
                        disabled={!isSelected}
                        value={selectedFormId}
                        onChange={(e) => handleVersionChange(title, e.target.value)}
                        className={`text-[11px] py-1 px-1.5 rounded-lg border font-mono transition ${
                          isSelected
                            ? 'bg-white dark:bg-[#252736] border-blue-400 dark:border-blue-700 text-blue-800 dark:text-blue-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500'
                            : 'bg-slate-200/80 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 cursor-not-allowed'
                        }`}
                        title="انتخاب نگارش فرم"
                      >
                        {versions.map(v => (
                          <option key={v.formID} value={v.formID}>
                            نگارش {v.version}.{v.revision} {v.status === 'Published' ? '✓' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* بخش فرم‌های انتخاب‌شده (سبد کوئری) با برچسب‌های فیلد کلیک‌پذیر */}
        {basketItems.length > 0 && (
          <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20 p-4 rounded-2xl border border-blue-200 dark:border-blue-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  فرم‌های انتخاب‌شده (سبد کوئری):
                </span>
              </div>
              <span className="text-[11px] text-blue-600 dark:text-blue-300 font-medium">
                💡 با کلیک روی هر فیلد، نام آن در کادر پرامپت درج می‌شود
              </span>
            </div>

            <div className="space-y-3">
              {basketItems.map(item => (
                <div key={item.formId} className="bg-white/80 dark:bg-[#1e2030] p-3 rounded-xl border border-blue-100 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.title}</span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-mono">
                        نگارش {item.formObj.version}.{item.formObj.revision}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        (FormID: {item.formId})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleForm(item.title)}
                      className="text-slate-400 hover:text-rose-500 text-[11px] cursor-pointer"
                      title="حذف از سبد"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* فیلدهای داخل فرم */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.fields.length === 0 ? (
                      <span className="text-[11px] text-slate-400">فیلدی در این نگارش فرم تعریف نشده است.</span>
                    ) : (
                      item.fields.map(f => (
                        <button
                          key={f.id || f.label}
                          type="button"
                          onClick={() => handleFieldClick(f, item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-white dark:bg-[#252736] border border-blue-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition shadow-2xs group cursor-pointer"
                          title={`کلیک برای درج فیلد "${f.label}" (${f.type})`}
                        >
                          <span className="font-medium">{f.label}</span>
                          <span className="text-[9px] opacity-60 font-mono group-hover:opacity-90">({f.type})</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* کادر پرامپت تحلیلی کاربر */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            ۲. نیاز تحلیلی یا فیلترهای مورد نظر خود را به زبان فارسی بنویسید:
          </label>
          <textarea
            rows={4}
            placeholder="مثلاً: لیست تمام درخواست‌های تاییدشده فرم ۱ را با ستون‌های نام و واحد از فرم ۲ بر اساس کد پرسنلی JOIN بزن و فقط مواردی که تاریخ آنها در سال جاری است را فیلتر کن."
            value={aiUserPrompt}
            onChange={(e) => setAiUserPrompt(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
          />
        </div>

        {/* دکمه تولید کوئری */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 pb-2">
          <button
            type="button"
            disabled={aiLoading || Object.keys(selectedFormVersions).length === 0 || !aiUserPrompt.trim()}
            onClick={handleGenerateQuery}
            className="w-full sm:w-auto justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:border disabled:border-slate-300 disabled:shadow-none disabled:opacity-100 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400 dark:disabled:border-slate-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} />
            <span>
              {aiLoading ? 'در حال تحلیل اسکیمای نگارش‌ها و تولید کوئری...' : 'تولید کوئری و View برای Power BI'}
            </span>
          </button>

          {Object.keys(selectedFormVersions).length > 0 && (
            <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
              تعداد فرم‌های انتخاب‌شده: {Object.keys(selectedFormVersions).length}
            </span>
          )}
        </div>

        {/* نمایش خروجی کوئری و توضیحات */}
        {aiQueryResult && (
          <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4 shadow-lg animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Code className="w-4 h-4" />
                <span>کد T-SQL تولیدشده برای اتصال به پایگاه‌داده:</span>
              </div>
              <button
                type="button"
                onClick={handleCopyQuery}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-200 flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                {copiedQuery ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-semibold">کوئری کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>کپی کوئری</span>
                  </>
                )}
              </button>
            </div>

            <pre dir="ltr" className="text-xs font-mono p-4 bg-black/50 rounded-xl overflow-x-auto text-emerald-300 leading-relaxed text-left border border-slate-800">
              {aiQueryResult.sqlQuery}
            </pre>

            {aiQueryResult.explanation && (
              <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-white block mb-1">توضیح عملکرد و ساختار کوئری:</span>
                <p className="whitespace-pre-line text-slate-300">{aiQueryResult.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
