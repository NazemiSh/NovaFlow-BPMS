import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import api from '../api';
import {
  Eye,
  ShieldCheck,
  Clock,
  Plus,
  Trash2,
  Copy,
  Star,
  Calendar,
  Layers,
  Database,
  GitBranch,
  Shield,
  Users,
  Info,
  Tag,
  Code2,
  CopyPlus,
  FileUp,
  AlertCircle,
  CheckCircle2,
  X,
  Search,
  Check,
  Printer,
  GripVertical,
  Table,
  ChevronUp,
  ChevronDown,
  MoveUp,
  MoveDown,
  Type,
  AlertTriangle,
  Calculator,
  Hash,
  ShieldAlert
} from 'lucide-react';
import PersianDatePicker, { getTodayJalaliStr } from './PersianDatePicker';
import PrintTemplateDesignerModal from './PrintTemplateDesignerModal';
import ErrorBoundary from './ErrorBoundary';
import DuplicateFormTitleModal, { getSuggestedTitle } from './DuplicateFormTitleModal';
import { useDialog } from './GlobalDialogProvider';
import { getNumericFieldsAndTables, evaluateValidationFormula } from '../utils/formulaEvaluator';

const matchMasterTableByCode = (tables, codeOrTitle) => {
  if (!Array.isArray(tables) || !codeOrTitle) return null;
  const key = String(codeOrTitle).trim().toLowerCase();
  return tables.find(t =>
    String(t.code || '').trim().toLowerCase() === key ||
    String(t.title || '').trim().toLowerCase() === key
  ) || null;
};

export default function FormBuilderTab({
  user = {},
  forms = [],
  branding = {},
  logoPreview = null,
  groups = [],
  usersList = [],
  editingFormId = null,
  setEditingFormId,
  formTitle = '',
  setFormTitle,
  formDesc = '',
  setFormDesc,
  showLogoInForm = true,
  setShowLogoInForm,
  formIsPublic = false,
  setFormIsPublic,
  hasPublicDeadline = false,
  setHasPublicDeadline,
  publicCloseDate = '',
  setPublicCloseDate,
  publicCloseTime = '23:59',
  setPublicCloseTime,
  selectedGroups = [],
  setSelectedGroups,
  activeCardId = 'q_1',
  setActiveCardId,
  sections = [],
  setSections,
  printTemplates = [],
  setPrintTemplates,
  validationRules = [],
  setValidationRules = () => {},
  workflowSteps = [],
  setWorkflowSteps,
  defaultCcUserIds = [],
  setDefaultCcUserIds,
  defaultCcGroupIds = [],
  setDefaultCcGroupIds,
  savingForm = false,
  onSaveAndPublish,
  onCloneAsIndependentForm,
  onOpenPreview
}) {
  const { toast, confirm } = useDialog();
  // مدیریت مقداردهی اولیه پایدار فرم‌ساز:
  // استفاده از useRef وابسته فقط به formId جهت اطمینان از اینکه مقداردهی اولیه بخش‌ها و سوالات صرفاً در زمان باز شدن اولیه فرم‌ساز
  // یا تغییر قطعی شناسه فرم انتخابی (editingFormId) صورت پذیرد و رندرهای دوره‌ای والد (App.jsx) هرگز استیت فیلدهای در حال طراحی را بازنشانی نکنند.
  const initializedFormIdRef = useRef(null);

  const [masterTables, setMasterTables] = useState([]);
  useEffect(() => {
    api.get('/masterdata/tables')
      .then(res => setMasterTables(res.data || []))
      .catch(() => {});
  }, []);

  // تطبیق خودکار کد مرجع (masterTableCode) به شناسه عددی واقعی جدول مرجع در زمان بارگذاری
  useEffect(() => {
    if (!masterTables || masterTables.length === 0 || !Array.isArray(sections) || sections.length === 0) return;
    let changed = false;
    const nextSections = sections.map(sec => {
      let secChanged = false;
      const nextQs = (sec.questions || []).map(q => {
        let updatedQ = q;
        if (q.type === 'master_lookup' && q.masterTableCode) {
          const hasValidId = q.masterTableId && masterTables.some(t => String(t.id) === String(q.masterTableId));
          if (!hasValidId) {
            const matched = matchMasterTableByCode(masterTables, q.masterTableCode);
            if (matched) {
              updatedQ = { ...updatedQ, masterTableId: String(matched.id) };
              secChanged = true;
            }
          }
        }
        if ((q.type === 'table' || q.type === 'repeater_grid') && Array.isArray(q.columns)) {
          let colsChanged = false;
          const nextCols = q.columns.map(c => {
            if (c.type === 'master_lookup' && c.masterTableCode) {
              const hasValidId = c.masterTableId && masterTables.some(t => String(t.id) === String(c.masterTableId));
              if (!hasValidId) {
                const matched = matchMasterTableByCode(masterTables, c.masterTableCode);
                if (matched) {
                  colsChanged = true;
                  return { ...c, masterTableId: String(matched.id) };
                }
              }
            }
            return c;
          });
          if (colsChanged) {
            updatedQ = { ...updatedQ, columns: nextCols };
            secChanged = true;
          }
        }
        return updatedQ;
      });
      if (secChanged) {
        changed = true;
        return { ...sec, questions: nextQs };
      }
      return sec;
    });
    if (changed) {
      setSections(nextSections);
    }
  }, [masterTables, sections]);

  // لیست کاربران فعال (حذف کاربران غیرفعال یا حذف‌شده از لیست‌های انتخاب گردش‌کار و رونوشت)
  const activeUsersList = useMemo(() => {
    return (usersList || []).filter(u => {
      if (u.isActive === false) return false;
      const name = String(u.displayName || u.username || '');
      if (name.includes('(حذف شده)') || name.includes('[Deleted_')) return false;
      const uname = String(u.username || '');
      if (uname.startsWith('[Deleted_')) return false;
      return true;
    });
  }, [usersList]);

  // بررسی وجود فیلدهای مرجع و جدول اقلام پویا در کل فرم
  const hasMasterOrRepeaterFields = useMemo(() => {
    return (sections || []).some(sec => (sec.questions || []).some(q =>
      q.type === 'master_lookup' ||
      q.type === 'repeater_grid' ||
      ((q.type === 'table' || q.type === 'repeater_grid') && (q.columns || []).some(c => c.type === 'master_lookup'))
    ));
  }, [sections]);

  useEffect(() => {
    const currentFormKey = editingFormId ? String(editingFormId) : '__new_form__';
    if (initializedFormIdRef.current === currentFormKey) {
      return; // در این نشست طراحی قبلاً مقداردهی شده، هرگز استیت را بازنشانی نکن
    }
    initializedFormIdRef.current = currentFormKey;

    if (editingFormId) {
      const found = forms.find(f => f.formID === editingFormId);
      if (found) {
        try {
          const parsed = typeof found.schemaJson === 'string' ? JSON.parse(found.schemaJson) : (found.schemaJson || {});
          if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            setSections(parsed.sections);
          }
          if (Array.isArray(parsed.validationRules)) {
            setValidationRules(parsed.validationRules);
          }
        } catch (e) {
          console.error('Error parsing form schema in FormBuilderTab:', e);
        }
      }
    } else if (!sections || sections.length === 0) {
      setSections([
        {
          sectionId: 'sec_1',
          title: 'بخش اول: اطلاعات اولیه',
          description: 'لطفاً اطلاعات هویتی و عمومی درخواست را وارد کنید.',
          questions: [
            {
              id: 'q_1',
              type: 'text',
              label: 'نام و نام خانوادگی',
              required: true,
              width: '1/1',
              hint: 'نام کامل متقاضی را وارد کنید'
            },
            {
              id: 'q_2',
              type: 'text',
              label: 'کد پرسنلی / کد ملی',
              required: true,
              width: '1/1',
              hint: 'شناسه معتبر سازمانی'
            }
          ]
        }
      ]);
    }
  }, [editingFormId]);

  const [printDesignerModalOpen, setPrintDesignerModalOpen] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneSearch, setCloneSearch] = useState('');
  const [duplicateTitleModal, setDuplicateTitleModal] = useState({
    isOpen: false,
    title: '',
    suggestedTitle: ''
  });

  const handleSaveAndPublishClick = () => {
    const cleanTitle = (formTitle || '').trim();
    if (!cleanTitle) {
      toast.warning('لطفاً عنوان فرم را وارد نمایید.');
      document.getElementById('form-title-input')?.focus();
      return;
    }

    // بررسی تکراری نبودن عنوان برای فرم‌های جدید یا فرم‌های با FormCode متفاوت
    const otherForms = editingFormId
      ? (forms || []).filter(f => f.formID !== editingFormId && f.formCode !== forms.find(x => x.formID === editingFormId)?.formCode)
      : (forms || []);

    const duplicateExists = otherForms.some(f => (f.title || '').trim().toLowerCase() === cleanTitle.toLowerCase());

    if (duplicateExists) {
      const allTitles = (forms || []).map(f => f.title);
      const suggested = getSuggestedTitle(cleanTitle, allTitles);
      setDuplicateTitleModal({
        isOpen: true,
        title: cleanTitle,
        suggestedTitle: suggested
      });
      return;
    }

    onSaveAndPublish();
  };

  const handleConfirmDuplicateAddNumber = () => {
    const newTitle = duplicateTitleModal.suggestedTitle;
    setFormTitle(newTitle);
    setDuplicateTitleModal({ isOpen: false, title: '', suggestedTitle: '' });
    onSaveAndPublish(newTitle);
  };

  const handleRenameManually = () => {
    setDuplicateTitleModal({ isOpen: false, title: '', suggestedTitle: '' });
    setTimeout(() => {
      const input = document.getElementById('form-title-input');
      if (input) {
        input.focus();
        input.select?.();
      }
    }, 100);
  };

  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonCopied, setJsonCopied] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [jsonSuccess, setJsonSuccess] = useState('');
  const jsonFileInputRef = useRef(null);

  const getCurrentFormJsonString = () => {
    const currentObj = {
      title: formTitle || 'فرم بدون عنوان',
      description: formDesc || '',
      showLogo: showLogoInForm,
      isPublic: formIsPublic,
      publicCloseDate: (formIsPublic && hasPublicDeadline) ? publicCloseDate : null,
      publicCloseTime: (formIsPublic && hasPublicDeadline) ? publicCloseTime : null,
      sections: sections,
      validationRules: validationRules || [],
      workflowPolicy: {
        steps: workflowSteps,
        defaultCcUserIds: defaultCcUserIds,
        defaultCcGroupIds: defaultCcGroupIds
      }
    };
    return JSON.stringify(currentObj, null, 2);
  };

  const handleOpenJsonModal = () => {
    setJsonText(getCurrentFormJsonString());
    setJsonError('');
    setJsonSuccess('');
    setJsonCopied(false);
    setJsonModalOpen(true);
  };

  const handleCopyJson = () => {
    try {
      navigator.clipboard.writeText(jsonText);
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2500);
    } catch (e) {
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2500);
    }
  };

  const handleJsonFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.format === 'BPMS_FORM_EXPORT_V1') {
        const inner = JSON.parse(parsed.schemaJson || '{}');
        const formatted = {
          ...inner,
          title: parsed.title || inner.title || formTitle,
          description: parsed.description || inner.description || formDesc
        };
        setJsonText(JSON.stringify(formatted, null, 2));
      } else {
        setJsonText(JSON.stringify(parsed, null, 2));
      }
      setJsonError('');
    } catch (err) {
      setJsonError('خطا در خواندن فایل JSON: ' + err.message);
    } finally {
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  const handleApplyJsonToForm = () => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError('خطای ساختار JSON: فرمت فایل یا متن وارد شده JSON معتبر نیست (' + err.message + ')');
      setJsonSuccess('');
      return;
    }

    if (parsed && parsed.format === 'BPMS_FORM_EXPORT_V1') {
      try {
        const inner = JSON.parse(parsed.schemaJson || '{}');
        parsed = {
          ...inner,
          title: parsed.title || inner.title,
          description: parsed.description || inner.description
        };
      } catch (e) {
        setJsonError('خطا در خواندن اسکیما داخلی فایل صادر شده.');
        setJsonSuccess('');
        return;
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setJsonError('کد JSON باید یک شیء (Object) معتبر باشد.');
      setJsonSuccess('');
      return;
    }

    // 1. Title validation
    if (!parsed.title || typeof parsed.title !== 'string' || !parsed.title.trim()) {
      setJsonError('عنوان فرم (فیلد title) الزامی است و نمی‌تواند خالی باشد.');
      setJsonSuccess('');
      return;
    }

    // 2. Sections validation
    if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      setJsonError('فرم باید دارای حداقل یک بخش (آرایه sections) باشد.');
      setJsonSuccess('');
      return;
    }

    // 3. Question types and uniqueness of IDs
    const allowedTypes = new Set([
      'text', 'paragraph', 'label', 'radio', 'checkbox', 'dropdown', 'file', 'date', 'time', 'number', 'rating', 'table', 'section', 'master_lookup', 'repeater_grid'
    ]);

    const seenIds = new Set();
    const seenSectionIds = new Set();

    for (let sIdx = 0; sIdx < parsed.sections.length; sIdx++) {
      const sec = parsed.sections[sIdx];
      if (!sec || typeof sec !== 'object') {
        setJsonError(`بخش شماره ${sIdx + 1} ساختار نامعتبر دارد.`);
        setJsonSuccess('');
        return;
      }

      if (sec.sectionId) {
        if (seenSectionIds.has(sec.sectionId)) {
          setJsonError(`شناسه بخش تکراری است: "${sec.sectionId}"`);
          setJsonSuccess('');
          return;
        }
        seenSectionIds.add(sec.sectionId);
      }

      const questions = sec.questions || sec.fields || [];
      if (!Array.isArray(questions)) {
        setJsonError(`لیست سوالات در بخش شماره ${sIdx + 1} ("${sec.title || 'بی‌نام'}") باید یک آرایه باشد.`);
        setJsonSuccess('');
        return;
      }

      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const q = questions[qIdx];
        if (!q || typeof q !== 'object') {
          setJsonError(`سوال شماره ${qIdx + 1} در بخش شماره ${sIdx + 1} نامعتبر است.`);
          setJsonSuccess('');
          return;
        }

        if (!q.id) {
          setJsonError(`شناسه سوال (id) در بخش ${sIdx + 1} برای "${q.label || qIdx + 1}" الزامی است.`);
          setJsonSuccess('');
          return;
        }

        if (seenIds.has(q.id)) {
          setJsonError(`شناسه سوال تکراری است: "${q.id}" (عنوان: ${q.label || 'بی‌نام'}). تمام شناسه‌ها باید یکتا باشند.`);
          setJsonSuccess('');
          return;
        }
        seenIds.add(q.id);

        if (!q.type || !allowedTypes.has(q.type)) {
          setJsonError(`نوع فیلد "${q.label || q.id}" نامعتبر است: (${q.type}). نوع‌های مجاز: ${Array.from(allowedTypes).join(', ')}`);
          setJsonSuccess('');
          return;
        }
      }
    }

    // All valid! Apply to builder state
    setFormTitle(parsed.title.trim());
    if (parsed.description !== undefined) setFormDesc(parsed.description || '');
    if (parsed.showLogo !== undefined) setShowLogoInForm(Boolean(parsed.showLogo));
    if (parsed.isPublic !== undefined) setFormIsPublic(Boolean(parsed.isPublic));
    if (parsed.publicCloseDate !== undefined) {
      setPublicCloseDate(parsed.publicCloseDate || '');
      setHasPublicDeadline(Boolean(parsed.publicCloseDate));
    }
    if (parsed.publicCloseTime !== undefined) setPublicCloseTime(parsed.publicCloseTime || '23:59');

    const normSections = parsed.sections.map((sec, sIdx) => ({
      sectionId: sec.sectionId || `sec_${Date.now()}_${sIdx}`,
      title: sec.title || `بخش ${sIdx + 1}`,
      description: sec.description || '',
      questions: (sec.questions || sec.fields || []).map((q, qIdx) => {
        const matchedMaster = q.masterTableCode && (!q.masterTableId || !masterTables.some(t => String(t.id) === String(q.masterTableId)))
          ? matchMasterTableByCode(masterTables, q.masterTableCode)
          : null;
        return {
          id: q.id || `q_${Date.now()}_${qIdx}`,
          type: q.type || 'text',
          label: q.label || 'سوال جدید',
          description: q.description || '',
          placeholder: q.placeholder || '',
          defaultValue: q.defaultValue !== undefined ? q.defaultValue : undefined,
          unit: q.unit || '',
          width: q.width || '1/1',
          maxDigits: q.maxDigits || undefined,
          required: Boolean(q.required),
          collapsible: q.collapsible !== undefined ? Boolean(q.collapsible) : true,
          defaultOpen: q.defaultOpen !== undefined ? Boolean(q.defaultOpen) : true,
          masterTableId: matchedMaster ? String(matchedMaster.id) : (q.masterTableId || ''),
          masterTableCode: q.masterTableCode || '',
          displayColumn: q.displayColumn || '',
          displayMode: q.displayMode || undefined,
          searchColumns: Array.isArray(q.searchColumns) ? q.searchColumns : [],
          autoFillMapping: Array.isArray(q.autoFillMapping) ? q.autoFillMapping : [],
          showSummaryRow: Boolean(q.showSummaryRow),
          columns: Array.isArray(q.columns) ? q.columns.map(c => {
            const matchedColMaster = c.masterTableCode && (!c.masterTableId || !masterTables.some(t => String(t.id) === String(c.masterTableId)))
              ? matchMasterTableByCode(masterTables, c.masterTableCode)
              : null;
            return {
              id: c.id || `col_${Date.now()}`,
              label: c.label || 'ستون',
              type: c.type || 'text',
              masterTableId: matchedColMaster ? String(matchedColMaster.id) : (c.masterTableId || ''),
              masterTableCode: c.masterTableCode || '',
              displayColumn: c.displayColumn || '',
              displayMode: c.displayMode || undefined,
              filterCondition: c.filterCondition || '',
              cascadingFilter: (c.cascadingFilter && typeof c.cascadingFilter === 'object')
                ? {
                    sourceColId: c.cascadingFilter.sourceColId || '',
                    targetMasterCol: c.cascadingFilter.targetMasterCol || ''
                  }
                : undefined,
              autoFillMapping: Array.isArray(c.autoFillMapping) ? c.autoFillMapping : [],
              formula: c.formula || '',
              includeInTotal: Boolean(c.includeInTotal),
              defaultValue: c.defaultValue !== undefined ? c.defaultValue : undefined,
              readOnly: c.readOnly !== undefined ? Boolean(c.readOnly) : undefined,
              options: Array.isArray(c.options) ? c.options : []
            };
          }) : (['table', 'repeater_grid'].includes(q.type) ? [
            { id: `col_1_${Date.now()}`, label: 'شرح قلم / کالا', type: 'text' },
            { id: `col_2_${Date.now()}`, label: 'تعداد / مقدار', type: 'number', includeInTotal: true },
            { id: `col_3_${Date.now()}`, label: 'تاریخ تحویل', type: 'date' }
          ] : undefined),
          options: Array.isArray(q.options) ? q.options : []
        };
      })
    }));
    setSections(normSections);

    if (Array.isArray(parsed.validationRules)) {
      setValidationRules(parsed.validationRules.map((vr, vrIdx) => ({
        id: vr.id || `rule_${Date.now()}_${vrIdx}`,
        formula: vr.formula || '',
        errorMessage: vr.errorMessage || ''
      })));
    } else {
      setValidationRules([]);
    }

    if (Array.isArray(parsed.printTemplates) && setPrintTemplates) {
      setPrintTemplates(parsed.printTemplates);
    }

    if (parsed.workflowPolicy) {
      const policy = parsed.workflowPolicy;
      if (Array.isArray(policy.steps)) {
        const normSteps = policy.steps.map(st => ({
          ...st,
          conditionLogic: st.conditionLogic || 'AND',
          conditions: (st.conditions && st.conditions.length > 0)
            ? st.conditions
            : (st.conditionField ? [{ field: st.conditionField, operator: st.conditionOperator || '>', value: st.conditionValue || '' }] : [])
        }));
        setWorkflowSteps(normSteps);
      }
      if (Array.isArray(policy.defaultCcUserIds)) setDefaultCcUserIds(policy.defaultCcUserIds);
      if (Array.isArray(policy.defaultCcGroupIds)) setDefaultCcGroupIds(policy.defaultCcGroupIds);
    }

    setJsonError('');
    setJsonSuccess('تغییرات با موفقیت روی فرم اعمال شد.');
    setTimeout(() => {
      setJsonModalOpen(false);
      setJsonSuccess('');
    }, 700);
  };
  const addQuestion = (secIndex, type = 'text') => {
    const labelMap = {
      text: 'سوال متنی کوتاه (Short answer)',
      paragraph: 'پاراگراف / توضیحات تکمیلی (Paragraph)',
      label: 'متن ثابت / لیبل راهنما (Label)',
      section: 'باکس سکشن عنوان‌دار (Section Card)',
      table: 'جدول اقلام / چندسطری (Repeating Table)',
      repeater_grid: 'جدول اقلام پویا (Repeater Grid)',
      master_lookup: 'انتخاب از بانک داده‌های مرجع (Master Lookup)',
      radio: 'پرسش چندگزینه‌ای (Multiple choice)',
      dropdown: 'انتخاب از منوی کشویی (Dropdown)',
      checkbox: 'چند انتخابی (Checkboxes)',
      date: 'تاریخ شمسی با تقویم جلالی (Date)',
      time: 'ساعت و زمان (Time)',
      number: 'مقدار عددی / مبلغ (Number)',
      rating: 'رتبه‌بندی و امتیازدهی (Rating ۱ تا ۵)',
      file: 'بارگذاری فایل و مستندات (File upload)'
    };

    const isWideType = ['paragraph', 'label', 'file', 'table', 'section', 'repeater_grid'].includes(type);

    const newQ = {
      id: `q_${Date.now()}`,
      type,
      label: labelMap[type] || 'سوال جدید',
      description: (type === 'label' || type === 'section') ? 'توضیحات تکمیلی این بخش...' : '',
      unit: type === 'number' ? 'عدد' : '',
      width: '1/1',
      maxDigits: type === 'number' ? '' : undefined,
      required: false,
      collapsible: type === 'section' ? true : undefined,
      defaultOpen: type === 'section' ? true : undefined,
      masterTableId: type === 'master_lookup' ? (masterTables[0]?.id ? String(masterTables[0].id) : '') : undefined,
      displayColumn: '',
      displayMode: type === 'master_lookup' ? 'combined' : undefined,
      autoFillMapping: type === 'master_lookup' ? [] : undefined,
      columns: (type === 'table' || type === 'repeater_grid') ? [
        { id: `col_1_${Date.now()}`, label: 'شرح قلم / کالا', type: 'text' },
        { id: `col_2_${Date.now()}`, label: 'تعداد / مقدار', type: 'number' },
        { id: `col_3_${Date.now()}`, label: 'تاریخ تحویل', type: 'date' }
      ] : undefined,
      options: (type === 'radio' || type === 'dropdown' || type === 'checkbox') ? ['گزینه ۱', 'گزینه ۲'] : []
    };
    const updated = [...sections];
    updated[secIndex].questions.push(newQ);
    setSections(updated);
    setActiveCardId(newQ.id);
  };

  const duplicateQuestion = (secIndex, qIndex) => {
    const targetQ = sections[secIndex].questions[qIndex];
    const cloned = JSON.parse(JSON.stringify(targetQ));
    cloned.id = `q_${Date.now()}`;
    cloned.label = `${targetQ.label} (کپی)`;
    const updated = [...sections];
    updated[secIndex].questions.splice(qIndex + 1, 0, cloned);
    setSections(updated);
    setActiveCardId(cloned.id);
  };

  const deleteQuestion = (secIndex, qIndex) => {
    const updated = [...sections];
    updated[secIndex].questions.splice(qIndex, 1);
    setSections(updated);
  };

  const [collapsedSections, setCollapsedSections] = useState({});

  const toggleSectionCollapse = (secId) => {
    setCollapsedSections(prev => ({
      ...prev,
      [secId]: !prev[secId]
    }));
  };

  const deleteSection = async (secIndex) => {
    if (sections.length <= 1) {
      toast.warning('حداقل وجود یک کادر سکشن در فرم الزامی است.');
      return;
    }
    const sec = sections[secIndex];
    if (sec.questions && sec.questions.length > 0) {
      const confirmed = await confirm({
        title: 'حذف کادر سکشن',
        message: `آیا از حذف این کادر سکشن و ${sec.questions.length} فیلد داخل آن اطمینان دارید؟`,
        confirmText: 'تایید و حذف بخش',
        variant: 'danger'
      });
      if (!confirmed) {
        return;
      }
    }
    const updated = sections.filter((_, idx) => idx !== secIndex);
    setSections(updated);
  };

  const moveSection = (secIndex, dir) => {
    const targetIdx = dir === 'up' ? secIndex - 1 : secIndex + 1;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    const updated = [...sections];
    const [moved] = updated.splice(secIndex, 1);
    updated.splice(targetIdx, 0, moved);
    setSections(updated);
  };

  const addSection = () => {
    const newSec = {
      sectionId: `sec_${Date.now()}`,
      title: `بخش ${sections.length + 1}: عنوان بخش جدید`,
      description: '',
      questions: [
        { id: `q_${Date.now()}`, type: 'text', label: 'سوال جدید', width: '1/1', required: false, options: [] }
      ]
    };
    setSections([...sections, newSec]);
  };

  // استخراج فیلدها برای شروط گام‌های تایید (عددی، متنی، تاریخ شمسی، زمان)
  const availableConditionFields = [];
  sections.forEach(sec => {
    (sec.questions || []).forEach(q => {
      availableConditionFields.push({ id: q.id, label: q.label, type: q.type });
    });
  });

  // استخراج فیلدهای عددی و جداول اقلام برای قوانین اعتبارسنجی فرمولی
  const { numericFields, tableColumns, tables } = useMemo(() => {
    return getNumericFieldsAndTables(sections);
  }, [sections]);

  const insertTokenToValidationRule = (ruleIdx, token) => {
    const rule = (validationRules || [])[ruleIdx];
    const inputId = `val-rule-formula-${rule?.id || ruleIdx}`;
    const el = document.getElementById(inputId);
    const currentVal = rule?.formula || '';
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const nextFormula = currentVal.substring(0, start) + token + currentVal.substring(end);
      const updated = (validationRules || []).map((r, i) => (i === ruleIdx ? { ...r, formula: nextFormula } : r));
      setValidationRules(updated);
      setTimeout(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      }, 20);
    } else {
      const nextFormula = currentVal ? `${currentVal} ${token}` : token;
      const updated = (validationRules || []).map((r, i) => (i === ruleIdx ? { ...r, formula: nextFormula } : r));
      setValidationRules(updated);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6 pb-12">
      {/* هدر استاندارد تب طراحی فرم */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl border border-slate-200 dark:border-slate-700/80 p-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg text-white shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-slate-800 dark:text-slate-100">
              {editingFormId ? 'ویرایش فرم و فرآیند' : 'طراحی فرم و فرآیند جدید'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تعریف فیلدها، سکشن‌ها، چیدمان ستونی و ماتریس گردش‌کار تاییدات سازمانی
            </p>
          </div>
        </div>
      </div>

      {/* بنر اطلاع‌رسانی انتقال خودکار قالب‌های چاپ */}
      {printTemplates && printTemplates.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 via-sky-50 to-blue-50/40 dark:from-blue-950/40 dark:via-slate-800/70 dark:to-indigo-950/30 border border-blue-200/90 dark:border-blue-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center shrink-0 border border-blue-200 dark:border-blue-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>انتقال هوشمند قالب‌های چاپ</span>
                <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold">
                  {printTemplates.length} قالب فعال
                </span>
              </h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                این نگارش دارای <b className="text-blue-700 dark:text-blue-300 font-mono font-bold">{printTemplates.length}</b> قالب چاپ منتقل‌شده از نگارش قبلی است. تغییرات فیلدها به صورت خودکار با قالب‌های چاپ همگام‌سازی می‌شوند.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPrintDesignerModalOpen(true)}
            className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3.5 py-2 rounded-xl font-bold transition shadow-xs cursor-pointer shrink-0"
            title="بازبینی و تنظیم قالب‌های چاپ متناسب با فیلدهای این نگارش"
          >
            <Printer className="w-4 h-4" />
            <span>بازبینی قالب‌های چاپ</span>
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-[#252736] border-t-8 border-blue-600 rounded-2xl p-3.5 sm:p-6 shadow-sm border border-slate-200 dark:border-slate-700/80 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-100 dark:border-blue-500/30 px-2.5 py-1 rounded-md font-semibold">
              {editingFormId ? 'ویرایش و انتشار نگارش جدید' : 'طراحی فرم جدید'}
            </span>
            <button
              type="button"
              onClick={onOpenPreview}
              className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-[#1e2030] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>پیش‌نمایش زنده</span>
            </button>
            <button
              type="button"
              onClick={handleOpenJsonModal}
              className="flex items-center gap-1.5 text-xs bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-3 py-1.5 rounded-lg transition font-medium cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>کد JSON فرم</span>
            </button>
            <button
              type="button"
              onClick={() => setCloneModalOpen(true)}
              className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 px-3 py-1.5 rounded-lg transition font-medium cursor-pointer"
            >
              <CopyPlus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>الگوبرداری از فرم‌های موجود</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showLogoInForm}
                onChange={(e) => setShowLogoInForm(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>نمایش لوگو</span>
            </label>

            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={formIsPublic}
                onChange={(e) => setFormIsPublic(e.target.checked)}
                className="rounded text-blue-600"
              />
              <span>نظرسنجی عمومی (بدون لاگین)</span>
            </label>
          </div>
        </div>

        {/* هشدار هوشمند غیرفعال بودن فیلدهای مرجع و جدول اقلام در نظرسنجی عمومی */}
        {formIsPublic && hasMasterOrRepeaterFields && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 p-3.5 rounded-2xl text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2.5 shadow-xs animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">هشدار امنیتی: استفاده از فیلدهای مرجع و جدول اقلام در فرم عمومی مجاز نیست</span>
              <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                در فرم‌های نظرسنجی عمومی (بدون لاگین)، امکان استفاده از «انتخاب از بانک داده‌های مرجع (Master Lookup)» و «جدول اقلام پویا (Repeater Grid)» به دلیل محدودیت‌های امنیتی کاربران ناشناس وجود ندارد. لطفاً این فیلدها را از فرم حذف کنید یا نوع آن‌ها را تغییر دهید.
              </p>
            </div>
          </div>
        )}

        {/* بنر هوشمند حاکمیت تایید ادمین */}
        {!formIsPublic && !user.roles?.includes('Admin') && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 p-3 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span><b>قانون حاکمیت سامانه:</b> این فرم پس از ذخیره، جهت بازبینی، تطبیق با اسکریپت‌ها و فعال‌سازی نهایی به کارتابل مدیر سیستم (Admin) ارسال خواهد شد.</span>
          </div>
        )}

        <div className="flex items-center gap-3 min-w-0">
          {showLogoInForm && (logoPreview || branding.logoUrl) && (
            <img
              src={logoPreview || branding.logoUrl}
              alt="Logo"
              className="w-10 h-10 sm:w-12 sm:h-12 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] p-1 shrink-0"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <input
            id="form-title-input"
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            className="min-w-0 flex-1 w-full text-lg sm:text-2xl font-bold text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-600 focus:outline-none pb-1 transition"
            placeholder="عنوان فرم بدون نام"
          />
        </div>
        <textarea
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
          className="w-full text-sm text-slate-500 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-600 focus:outline-none resize-none pb-1 transition"
          placeholder="توضیحات و راهنمای تکمیل فرم..."
          rows={2}
        />

        {formIsPublic && (
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-2xl p-4 space-y-3">
            <label className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-200 cursor-pointer">
              <input
                type="checkbox"
                checked={hasPublicDeadline}
                onChange={(e) => {
                  setHasPublicDeadline(e.target.checked);
                  if (e.target.checked && !publicCloseDate) {
                    setPublicCloseDate(getTodayJalaliStr());
                  }
                }}
                className="rounded text-blue-600"
              />
              <span>تعیین مهلت زمانی پایان نظرسنجی عمومی (غیرفعال‌سازی خودکار پس از تاریخ و ساعت مشخص)</span>
            </label>

            {hasPublicDeadline && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">تاریخ پایان نظرسنجی (شمسی):</label>
                  <PersianDatePicker
                    value={publicCloseDate}
                    onChange={(val) => setPublicCloseDate(val)}
                    placeholder="انتخاب تاریخ پایان..."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">ساعت پایان نظرسنجی:</label>
                  <input
                    type="time"
                    value={publicCloseTime}
                    onChange={(e) => setPublicCloseTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#252736] rounded-2xl p-5 border border-slate-200 dark:border-slate-700/80 shadow-sm">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
          گروه‌های سازمانی مجاز جهت ثبت فرم {formIsPublic ? '(اختیاری — علاوه بر لینک عمومی، اعضای این گروه‌ها نیز فرم را در کارتابل خود می‌بینند)' : ''}:
        </label>
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => {
            const gid = g.groupID || g.groupId;
            return (
              <button
                key={gid}
                type="button"
                onClick={() => {
                  setSelectedGroups(selectedGroups.includes(gid)
                    ? selectedGroups.filter(id => id !== gid)
                    : [...selectedGroups, gid]);
                }}
                className={`text-xs px-3 py-1.5 rounded-lg border transition font-medium cursor-pointer ${
                  selectedGroups.includes(gid)
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-[#1e2030] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {g.groupName}
              </button>
            );
          })}
        </div>
      </div>

      {/* بخش‌های سوالات فرم به عنوان کادرهای سکشن واقعی (Section Container با حاشیه نقطه‌چین) */}
      <div className="space-y-6">
        {sections.map((sec, secIndex) => {
          const isCollapsed = Boolean(collapsedSections[sec.sectionId]);

          return (
            <div
              key={sec.sectionId || secIndex}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                try {
                  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                  if (data.secIndex !== undefined && data.qIndex !== undefined) {
                    if (data.secIndex !== secIndex) {
                      const updated = [...sections];
                      const [moved] = updated[data.secIndex].questions.splice(data.qIndex, 1);
                      updated[secIndex].questions.push(moved);
                      setSections(updated);
                    }
                  }
                } catch {}
              }}
              className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl p-4 md:p-6 bg-slate-50 dark:bg-slate-800/60 transition-all space-y-4 shadow-2xs"
            >
              {/* هدر کادر سکشن: عنوان، توضیحات، دکمه‌های آکاردئونی و مدیریت سکشن */}
              <div className="pb-3 border-b border-dashed border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-sky-400 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
                      بخش {secIndex + 1} از {sections.length}
                    </span>
                    <input
                      type="text"
                      value={sec.title}
                      placeholder="عنوان این بخش / کادر سکشن..."
                      onChange={(e) => {
                        const updated = [...sections];
                        updated[secIndex].title = e.target.value;
                        setSections(updated);
                      }}
                      className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-blue-600 focus:outline-none w-full transition py-0.5"
                    />
                  </div>

                  {/* نوار ابزار بالای کادر سکشن */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => addQuestion(secIndex, 'text')}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-sky-400 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs"
                      title="افزودن فیلد جدید به این کادر سکشن"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>فیلد جدید</span>
                    </button>

                    <button
                      type="button"
                      disabled={secIndex === 0}
                      onClick={() => moveSection(secIndex, 'up')}
                      className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                      title="حرکت سکشن به بالا"
                    >
                      <MoveUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={secIndex === sections.length - 1}
                      onClick={() => moveSection(secIndex, 'down')}
                      className="p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                      title="حرکت سکشن به پایین"
                    >
                      <MoveDown className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteSection(secIndex)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                      title="حذف این کادر سکشن"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSectionCollapse(sec.sectionId)}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                      title={isCollapsed ? 'باز کردن کادر سکشن' : 'جمع کردن کادر سکشن'}
                    >
                      <span className="text-[11px]">{isCollapsed ? 'نمایش' : 'بستن'}</span>
                      {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* فیلد اختیاری توضیحات سکشن */}
                <input
                  type="text"
                  value={sec.description || ''}
                  placeholder="توضیحات و راهنمای اختیاری برای فیلدهای این کادر سکشن..."
                  onChange={(e) => {
                    const updated = [...sections];
                    updated[secIndex].description = e.target.value;
                    setSections(updated);
                  }}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 bg-transparent border-b border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-400 focus:outline-none transition py-0.5"
                />
              </div>

              {/* بدنه کادر سکشن */}
              {isCollapsed ? (
                <div
                  onClick={() => toggleSectionCollapse(sec.sectionId)}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center cursor-pointer hover:border-blue-300 transition"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    این کادر سکشن بسته است (حاوی {(sec.questions || []).length} فیلد) — برای مشاهده و ویرایش کلیک کنید.
                  </span>
                </div>
              ) : (sec.questions || []).length === 0 ? (
                <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center bg-white/50 dark:bg-slate-800/30 space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    هنوز فیلدی در این کادر سکشن قرار ندارد. فیلدها را به اینجا بکشید (Drag & Drop) یا از دکمه زیر فیلد اضافه کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => addQuestion(secIndex, 'text')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-sky-400 bg-white dark:bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن اولین فیلد به این سکشن</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-4">
            {sec.questions.map((q, qIndex) => {
              const isActive = activeCardId === q.id;
              const isNarrow = q.width === '1/2' || q.width === '1/3';
              const colSpanClass = q.width === '1/3'
                ? 'col-span-12 md:col-span-4'
                : q.width === '1/2'
                ? 'col-span-12 md:col-span-6'
                : 'col-span-12';

              const moveQuestion = (dir) => {
                const targetIdx = dir === 'up' ? qIndex - 1 : qIndex + 1;
                if (targetIdx < 0 || targetIdx >= sec.questions.length) return;
                const updated = [...sections];
                const [moved] = updated[secIndex].questions.splice(qIndex, 1);
                updated[secIndex].questions.splice(targetIdx, 0, moved);
                setSections(updated);
              };

              const updateWidth = (w) => {
                const updated = [...sections];
                updated[secIndex].questions[qIndex].width = w;
                setSections(updated);
              };

              return (
                <div
                  key={q.id}
                  data-card-id={q.id}
                  className={`${colSpanClass} min-w-0 overflow-hidden transition-all`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                      if (data.secIndex !== undefined && data.qIndex !== undefined) {
                        if (data.secIndex === secIndex && data.qIndex === qIndex) return;
                        const updated = [...sections];
                        const [moved] = updated[data.secIndex].questions.splice(data.qIndex, 1);
                        const targetIdx = (data.secIndex === secIndex && data.qIndex < qIndex) ? qIndex - 1 : qIndex;
                        updated[secIndex].questions.splice(Math.max(0, targetIdx), 0, moved);
                        setSections(updated);
                      }
                    } catch {}
                  }}
                >
                  <div className="relative flex items-start gap-2 h-full min-w-0 overflow-hidden w-full">
                    <div
                      onClick={() => setActiveCardId(q.id)}
                      onFocusCapture={() => setActiveCardId(q.id)}
                      className={`flex-1 min-w-0 overflow-hidden w-full flex flex-col justify-between bg-white dark:bg-[#252736] rounded-2xl p-3 sm:p-4 md:p-5 border transition shadow-xs ${
                        isActive
                          ? 'border-sky-400 ring-2 ring-sky-500/25 shadow-lg shadow-sky-950/30'
                          : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {/* نوار بالای کارت: دستگیره درگ، نوار ابزار سریع در مرکز و دکمه‌های جابه‌جایی */}
                      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100 dark:border-slate-700/60 text-slate-400 min-w-0 w-full gap-2">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData('text/plain', JSON.stringify({ secIndex, qIndex }));
                              e.dataTransfer.effectAllowed = 'move';
                              const card = e.currentTarget.closest('[data-card-id]');
                              if (card && e.dataTransfer.setDragImage) {
                                const rect = card.getBoundingClientRect();
                                e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
                              }
                            }}
                            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-600 shrink-0 select-none"
                            title="برای تغییر ترتیب درگ کنید (Drag & Drop)"
                          >
                            <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
                          </span>
                          <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 shrink-0">
                            #{qIndex + 1}
                          </span>
                          {formIsPublic && (q.type === 'master_lookup' || q.type === 'repeater_grid') ? (
                            <span className="text-[9px] bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 px-1.5 py-0.5 rounded font-bold shrink-0">
                              غیرمجاز
                            </span>
                          ) : q.type === 'section' ? (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-sky-400 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded font-bold truncate max-w-[80px]">
                              سکشن
                            </span>
                          ) : q.type === 'repeater_grid' ? (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold truncate max-w-[80px]">
                              جدول اقلام
                            </span>
                          ) : null}
                        </div>

                        {/* نوار ابزار افقی فشرده در مرکز هدر (Compact Quick-Add Pill) */}
                        <div className="flex items-center justify-center flex-1 min-w-0 px-0.5">
                          <div className={`inline-flex items-center gap-0.5 p-0.5 rounded-full border shadow-2xs transition-all ${
                            isActive
                              ? 'bg-sky-950/70 border-sky-400/70 text-sky-300 ring-1 ring-sky-400/30'
                              : 'bg-slate-100/90 dark:bg-[#1a1c28] border-slate-200/80 dark:border-slate-700/80 opacity-55 hover:opacity-100 text-slate-500 dark:text-slate-400'
                          }`}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); addQuestion(secIndex, 'text'); }}
                              title="افزودن متن"
                              className={`p-0.5 sm:p-1 rounded-full transition cursor-pointer ${
                                isActive
                                  ? 'text-sky-300 hover:text-white hover:bg-sky-800/60'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              <Type className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={formIsPublic}
                              onClick={(e) => { e.stopPropagation(); addQuestion(secIndex, 'master_lookup'); }}
                              title={formIsPublic ? 'غیرفعال در نظرسنجی عمومی' : 'افزودن انتخاب از مرجع'}
                              className={`p-0.5 sm:p-1 rounded-full transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer ${
                                isActive
                                  ? 'text-sky-300 hover:text-white hover:bg-sky-800/60'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              <Database className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={formIsPublic}
                              onClick={(e) => { e.stopPropagation(); addQuestion(secIndex, 'repeater_grid'); }}
                              title={formIsPublic ? 'غیرفعال در نظرسنجی عمومی' : 'افزودن جدول اقلام'}
                              className={`p-0.5 sm:p-1 rounded-full transition disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer ${
                                isActive
                                  ? 'text-sky-300 hover:text-white hover:bg-sky-800/60'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              <Table className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); addQuestion(secIndex, 'date'); }}
                              title="افزودن تاریخ شمسی"
                              className={`p-0.5 sm:p-1 rounded-full transition cursor-pointer ${
                                isActive
                                  ? 'text-sky-300 hover:text-white hover:bg-sky-800/60'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              <Calendar className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); addSection(); }}
                              title="افزودن بخش جدید"
                              className={`p-0.5 sm:p-1 rounded-full transition cursor-pointer ${
                                isActive
                                  ? 'text-sky-300 hover:text-white hover:bg-sky-800/60'
                                  : 'text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                            >
                              <Layers className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* کلیدهای جابه‌جایی دستی */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={qIndex === 0}
                            onClick={(e) => { e.stopPropagation(); moveQuestion('up'); }}
                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            title="حرکت به بالا"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={qIndex === sec.questions.length - 1}
                            onClick={(e) => { e.stopPropagation(); moveQuestion('down'); }}
                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            title="حرکت به پایین"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* عنوان و نوع ورودی - در حالت 1/2 و 1/3 به صورت عمودی (flex-col gap-2) و w-full min-w-0 */}
                      <div className={`flex ${isNarrow ? 'flex-col gap-2' : 'flex-col sm:flex-row gap-2.5'} items-stretch sm:items-center mb-4 min-w-0 w-full`}>
                        <input
                          type="text"
                          value={q.label}
                          onChange={(e) => {
                            const updated = [...sections];
                            updated[secIndex].questions[qIndex].label = e.target.value;
                            setSections(updated);
                          }}
                          className="w-full min-w-0 font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-[#1e2030] hover:bg-slate-100 dark:hover:bg-[#252736] focus:bg-white dark:focus:bg-[#1e2030] px-3 py-2 rounded-xl border border-transparent focus:border-blue-500 focus:outline-none transition text-sm"
                          placeholder={q.type === 'section' ? 'عنوان باکس سکشن...' : 'متن سوال یا فیلد...'}
                        />

                        <select
                          value={q.type}
                          onChange={(e) => {
                            const updated = [...sections];
                            const newType = e.target.value;
                            updated[secIndex].questions[qIndex].type = newType;
                            if ((newType === 'table' || newType === 'repeater_grid') && !q.columns) {
                              updated[secIndex].questions[qIndex].columns = [
                                { id: `col_1_${Date.now()}`, label: 'شرح قلم / کالا', type: 'text' },
                                { id: `col_2_${Date.now()}`, label: 'تعداد / مقدار', type: 'number', includeInTotal: true },
                                { id: `col_3_${Date.now()}`, label: 'تاریخ تحویل', type: 'date' }
                              ];
                              updated[secIndex].questions[qIndex].showSummaryRow = true;
                              updated[secIndex].questions[qIndex].width = '1/1';
                            }
                            if (newType === 'master_lookup') {
                              updated[secIndex].questions[qIndex].masterTableId = masterTables[0]?.id ? String(masterTables[0].id) : '';
                              updated[secIndex].questions[qIndex].autoFillMapping = [];
                            }
                            if (newType === 'section') {
                              updated[secIndex].questions[qIndex].collapsible = true;
                              updated[secIndex].questions[qIndex].width = '1/1';
                            }
                            if ((newType === 'radio' || newType === 'dropdown' || newType === 'checkbox') && (!q.options || q.options.length === 0)) {
                              updated[secIndex].questions[qIndex].options = ['گزینه ۱', 'گزینه ۲'];
                            }
                            setSections(updated);
                          }}
                          className={`${isNarrow ? 'w-full min-w-0' : 'w-full sm:w-auto shrink-0'} px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1e2030]`}
                        >
                          <option value="text">متن کوتاه (Short answer)</option>
                          <option value="paragraph">پاراگراف / متن بلند (Paragraph)</option>
                          <option value="master_lookup" disabled={formIsPublic}>
                            {formIsPublic ? '⛔ انتخاب از مرجع (غیرفعال در نظرسنجی عمومی)' : 'انتخاب از بانک داده‌های مرجع (Master Lookup)'}
                          </option>
                          <option value="table">جدول اقلام / چندسطری (Repeating Table)</option>
                          <option value="repeater_grid" disabled={formIsPublic}>
                            {formIsPublic ? '⛔ جدول اقلام پویا (غیرفعال در نظرسنجی عمومی)' : 'جدول اقلام پویا (Repeater Grid)'}
                          </option>
                          <option value="section">باکس سکشن عنوان‌دار (Section Card)</option>
                          <option value="label">متن ثابت / لیبل راهنما (Label)</option>
                          <option value="radio">چند گزینه‌ای (Multiple choice)</option>
                          <option value="checkbox">چک‌باکس (Checkboxes)</option>
                          <option value="dropdown">منوی کشویی (Dropdown)</option>
                          <option value="file">بارگذاری مستندات / فایل (File upload)</option>
                          <option value="date">تاریخ شمسی (Jalali Date)</option>
                          <option value="time">زمان / ساعت (Time)</option>
                          <option value="number">عدد / مبلغ (Number)</option>
                          <option value="rating">امتیازدهی و رتبه‌بندی (Rating)</option>
                        </select>
                      </div>

                      {/* تنظیمات محتوای فیلد */}
                      <div className="flex-1 min-w-0">
                        {/* فیلد باکس سکشن (Section Card) */}
                        {q.type === 'section' && (
                          <div className="mb-4 space-y-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                            <div className="flex items-center gap-2 text-blue-600 dark:text-sky-400 text-xs font-bold">
                              <Layers className="w-4 h-4" />
                              <span>تنظیمات باکس سکشن (Section Card):</span>
                            </div>
                            <textarea
                              placeholder="توضیحات تکمیلی یا متن راهنما برای فیلدهای این سکشن (اختیاری)..."
                              value={q.description || ''}
                              onChange={(e) => {
                                const updated = [...sections];
                                updated[secIndex].questions[qIndex].description = e.target.value;
                                setSections(updated);
                              }}
                              rows={2}
                              className="w-full text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-[#1e2030] p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={q.collapsible !== false}
                                onChange={(e) => {
                                  const updated = [...sections];
                                  updated[secIndex].questions[qIndex].collapsible = e.target.checked;
                                  setSections(updated);
                                }}
                                className="rounded text-blue-600"
                              />
                              <span>امکان جمع شدن / باز و بسته شدن توسط کاربر (Collapsible)</span>
                            </label>
                          </div>
                        )}

                        {/* فیلد انتخاب از بانک داده‌های مرجع (Master Data Lookup) */}
                        {q.type === 'master_lookup' && (() => {
                          const selectedMaster = masterTables.find(t => String(t.id) === String(q.masterTableId));
                          const masterCols = selectedMaster?.columns || [];
                          const otherFormQuestions = sections.flatMap(s => s.questions || []).filter(oq => oq.id !== q.id && !['table', 'repeater_grid', 'section', 'label'].includes(oq.type));

                          return (
                            <div className="mb-4 space-y-3 bg-indigo-50/70 dark:bg-[#1e2030] p-4 rounded-xl border border-indigo-200 dark:border-indigo-900">
                              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-xs font-bold">
                                <Database className="w-4 h-4" />
                                <span>تنظیمات اتصال به بانک داده‌های مرجع (Master Data):</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    انتخاب جدول مرجع <span className="text-rose-500">*</span>
                                  </label>
                                  <select
                                    value={q.masterTableId || ''}
                                    onChange={(e) => {
                                      const updated = [...sections];
                                      const selId = e.target.value;
                                      const matched = masterTables.find(t => String(t.id) === String(selId));
                                      updated[secIndex].questions[qIndex].masterTableId = selId;
                                      updated[secIndex].questions[qIndex].masterTableCode = matched?.code || '';
                                      setSections(updated);
                                    }}
                                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                                  >
                                    <option value="">-- انتخاب جدول مرجع --</option>
                                    {masterTables.map(t => (
                                      <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                                    ))}
                                  </select>
                                  {!selectedMaster && q.masterTableCode && (
                                    <span className="block mt-1 text-[10px] text-amber-700 dark:text-amber-300 font-mono">
                                      کد مرجع تعریف‌شده: {q.masterTableCode} (تطبیق خودکار پس از ایجاد در بانک داده‌های مرجع)
                                    </span>
                                  )}
                                </div>

                                <div>
                                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                    ستون نمایشی در فیلد ورودی
                                  </label>
                                  <select
                                    value={q.displayColumn || ''}
                                    onChange={(e) => {
                                      const updated = [...sections];
                                      updated[secIndex].questions[qIndex].displayColumn = e.target.value;
                                      setSections(updated);
                                    }}
                                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                                  >
                                    <option value="">پیش‌فرض (کلید یکتا)</option>
                                    {masterCols.map(c => (
                                      <option key={c.name} value={c.name}>{c.title} ({c.name})</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* حالت نمایش مقدار پس از انتخاب */}
                              <div className="pt-2 border-t border-indigo-100 dark:border-indigo-900/60">
                                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                                  حالت نمایش مقدار پس از انتخاب
                                </label>
                                <select
                                  value={q.displayMode || ((q.autoFillMapping && q.autoFillMapping.length > 0) ? 'keyOnly' : 'combined')}
                                  onChange={(e) => {
                                    const updated = [...sections];
                                    updated[secIndex].questions[qIndex].displayMode = e.target.value;
                                    setSections(updated);
                                  }}
                                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                                >
                                  <option value="keyOnly">فقط مقدار ستون کلید / نمایشی (پیش‌فرض هنگام داشتن Auto-Fill)</option>
                                  <option value="combined">ترکیب کد و عنوان (مثلاً 000001 - نام کالا)</option>
                                </select>
                              </div>

                              {/* نگاشت فیلدهای خودکار فرم بر اساس انتخاب آیتم مرجع (Auto-Fill) */}
                              <div className="space-y-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/60">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300">
                                    پر کردن خودکار سایر فیلدهای فرم (Auto-Fill Mapping):
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...sections];
                                      const maps = updated[secIndex].questions[qIndex].autoFillMapping || [];
                                      maps.push({ formFieldId: otherFormQuestions[0]?.id || '', sourceColumn: masterCols[0]?.name || '', readOnly: false });
                                      updated[secIndex].questions[qIndex].autoFillMapping = maps;
                                      setSections(updated);
                                    }}
                                    className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                                  >
                                    + افزودن نگاشت فیلد
                                  </button>
                                </div>

                                {(q.autoFillMapping || []).map((m, mIdx) => (
                                  <div key={mIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white dark:bg-[#252736] p-2 rounded-lg border border-indigo-100 dark:border-indigo-900 text-xs">
                                    <span className="text-[10px] text-slate-400 shrink-0">فیلد فرم:</span>
                                    <select
                                      value={m.formFieldId}
                                      onChange={(e) => {
                                        const updated = [...sections];
                                        updated[secIndex].questions[qIndex].autoFillMapping[mIdx].formFieldId = e.target.value;
                                        setSections(updated);
                                      }}
                                      className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] w-full sm:flex-1 min-w-0"
                                    >
                                      {otherFormQuestions.map(of => (
                                        <option key={of.id} value={of.id}>{of.label} ({of.id})</option>
                                      ))}
                                    </select>

                                    <span className="text-[10px] text-slate-400 shrink-0">از ستون:</span>
                                    <select
                                      value={m.sourceColumn}
                                      onChange={(e) => {
                                        const updated = [...sections];
                                        updated[secIndex].questions[qIndex].autoFillMapping[mIdx].sourceColumn = e.target.value;
                                        setSections(updated);
                                      }}
                                      className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] w-full sm:flex-1 min-w-0"
                                    >
                                      {masterCols.map(c => (
                                        <option key={c.name} value={c.name}>{c.title} ({c.name})</option>
                                      ))}
                                    </select>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...sections];
                                        updated[secIndex].questions[qIndex].autoFillMapping.splice(mIdx, 1);
                                        setSections(updated);
                                      }}
                                      className="p-1 text-rose-500 hover:text-rose-700 self-end sm:self-center shrink-0"
                                      title="حذف نگاشت"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* فیلد جدول اقلام / چندسطری (Repeating Table & Repeater Grid) */}
                        {(q.type === 'table' || q.type === 'repeater_grid') && (
                          <div className="mb-4 space-y-3 bg-blue-50/60 dark:bg-[#1e2030] p-2.5 sm:p-4 rounded-xl border border-blue-200 dark:border-slate-700">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-xs font-bold">
                                <Table className="w-4 h-4 shrink-0" />
                                <span>تنظیمات جدول اقلام پویا (Repeater Grid):</span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                                <label className="flex items-center gap-1.5 text-xs text-blue-900 dark:text-blue-300 font-bold cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(q.showSummaryRow)}
                                    onChange={(e) => {
                                      const updated = [...sections];
                                      updated[secIndex].questions[qIndex].showSummaryRow = e.target.checked;
                                      setSections(updated);
                                    }}
                                    className="rounded text-blue-600 shrink-0"
                                  />
                                  <span>سطر جمع کل در پایین جدول (Summary Row)</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...sections];
                                    const cols = updated[secIndex].questions[qIndex].columns || [];
                                    cols.push({ id: `col_${Date.now()}`, label: `ستون ${cols.length + 1}`, type: 'text' });
                                    updated[secIndex].questions[qIndex].columns = cols;
                                    setSections(updated);
                                  }}
                                  className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:text-blue-800 flex items-center justify-center sm:justify-start gap-1 cursor-pointer bg-white dark:bg-[#252736] px-2.5 py-1.5 sm:py-1 rounded-lg border border-blue-200 dark:border-slate-700 self-start sm:self-auto"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>افزودن ستون جدید</span>
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {(q.columns || []).map((col, cIdx) => {
                                const selectedColMaster = masterTables.find(t => String(t.id) === String(col.masterTableId));
                                const colMasterCols = selectedColMaster?.columns || [];
                                const otherColsInRow = (q.columns || []).filter((_, i) => i !== cIdx);

                                return (
                                  <div key={col.id || cIdx} className="bg-white dark:bg-[#252736] p-2.5 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                      <div className="flex items-center gap-2 w-full sm:flex-1 min-w-0">
                                        <span className="text-[11px] font-mono text-slate-400 w-5 text-center shrink-0">#{cIdx + 1}</span>
                                        <input
                                          type="text"
                                          placeholder="عنوان ستون..."
                                          value={col.label}
                                          onChange={(e) => {
                                            const updated = [...sections];
                                            updated[secIndex].questions[qIndex].columns[cIdx].label = e.target.value;
                                            setSections(updated);
                                          }}
                                          className="text-xs px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 min-w-0 flex-1 w-full bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                                        />
                                      </div>

                                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                                        <select
                                          value={col.type}
                                          onChange={(e) => {
                                            const updated = [...sections];
                                            const nextType = e.target.value;
                                            updated[secIndex].questions[qIndex].columns[cIdx].type = nextType;
                                            if (nextType === 'master_lookup' && !col.masterTableId) {
                                              updated[secIndex].questions[qIndex].columns[cIdx].masterTableId = masterTables[0]?.id ? String(masterTables[0].id) : '';
                                            }
                                            setSections(updated);
                                          }}
                                          className="text-xs px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-700 dark:text-slate-200 flex-1 sm:flex-initial min-w-0"
                                        >
                                          <option value="text">متن کوتاه</option>
                                          <option value="number">عدد / مبلغ</option>
                                          <option value="date">تاریخ شمسی</option>
                                          <option value="dropdown">منوی کشویی</option>
                                          <option value="master_lookup" disabled={formIsPublic}>
                                            {formIsPublic ? '⛔ مرجع (غیرفعال در نظرسنجی عمومی)' : 'مرجع (Master Lookup)'}
                                          </option>
                                          <option value="calculated">محاسباتی (فرمول)</option>
                                        </select>

                                        {(col.type === 'number' || col.type === 'calculated') && (
                                          <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(col.includeInTotal)}
                                              onChange={(e) => {
                                                const updated = [...sections];
                                                updated[secIndex].questions[qIndex].columns[cIdx].includeInTotal = e.target.checked;
                                                setSections(updated);
                                              }}
                                              className="rounded text-blue-600"
                                            />
                                            <span>جمع کل</span>
                                          </label>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...sections];
                                            updated[secIndex].questions[qIndex].columns.splice(cIdx, 1);
                                            setSections(updated);
                                          }}
                                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                                          title="حذف ستون"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* اگر ستون از نوع مرجع باشد */}
                                    {col.type === 'master_lookup' && (
                                      <div className="p-2.5 rounded-lg bg-indigo-50/60 dark:bg-[#181926] border border-indigo-100 dark:border-indigo-900/60 space-y-2.5">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[11px] text-indigo-900 dark:text-indigo-300 font-bold">
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            <Database className="w-3 h-3 shrink-0" />
                                            <span>اتصال به جدول مرجع:</span>
                                          </div>
                                          <select
                                            value={col.masterTableId || ''}
                                            onChange={(e) => {
                                              const updated = [...sections];
                                              const selId = e.target.value;
                                              const matched = masterTables.find(t => String(t.id) === String(selId));
                                              updated[secIndex].questions[qIndex].columns[cIdx].masterTableId = selId;
                                              updated[secIndex].questions[qIndex].columns[cIdx].masterTableCode = matched?.code || '';
                                              setSections(updated);
                                            }}
                                            className="text-xs px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-full sm:w-auto min-w-0"
                                          >
                                            <option value="">-- انتخاب جدول مرجع --</option>
                                            {masterTables.map(t => (
                                              <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                                            ))}
                                          </select>
                                          {!selectedColMaster && col.masterTableCode && (
                                            <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded self-start sm:self-auto">
                                              کد مرجع: {col.masterTableCode}
                                            </span>
                                          )}
                                        </div>

                                        {/* حالت نمایش مقدار در سلول جدول */}
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[11px] pt-1">
                                          <span className="text-slate-600 dark:text-slate-300 font-medium shrink-0">حالت نمایش در ستون:</span>
                                          <select
                                            value={col.displayMode || ((col.autoFillMapping && col.autoFillMapping.length > 0) ? 'keyOnly' : 'combined')}
                                            onChange={(e) => {
                                              const updated = [...sections];
                                              updated[secIndex].questions[qIndex].columns[cIdx].displayMode = e.target.value;
                                              setSections(updated);
                                            }}
                                            className="text-xs px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-full sm:flex-1 min-w-0"
                                          >
                                            <option value="keyOnly">فقط مقدار ستون کلید / نمایشی (جلوگیری از تکرار نام کالا در ستون کد)</option>
                                            <option value="combined">ترکیب کد و عنوان (کد - نام)</option>
                                          </select>
                                        </div>

                                        {/* فیلتر آبشاری وابسته به ستون دیگر این ردیف (Cascading Filter) */}
                                        <div className="p-2 rounded-lg bg-white/80 dark:bg-[#252736] border border-indigo-100 dark:border-slate-700 space-y-1.5">
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-bold text-indigo-800 dark:text-sky-300">
                                            <span>فیلتر وابسته به ستون دیگر این ردیف (Cascading Filter):</span>
                                            {col.cascadingFilter?.sourceColId && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updated = [...sections];
                                                  delete updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter;
                                                  setSections(updated);
                                                }}
                                                className="text-[10px] text-rose-500 hover:underline font-medium cursor-pointer self-start sm:self-auto"
                                              >
                                                حذف وابستگی
                                              </button>
                                            )}
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                            <div>
                                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                                                ستون مبدا در همین جدول:
                                              </label>
                                              <select
                                                value={col.cascadingFilter?.sourceColId || ''}
                                                onChange={(e) => {
                                                  const updated = [...sections];
                                                  const sourceColId = e.target.value;
                                                  if (!sourceColId) {
                                                    delete updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter;
                                                  } else {
                                                    const prevTarget = updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter?.targetMasterCol || '';
                                                    updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter = {
                                                      sourceColId,
                                                      targetMasterCol: prevTarget || colMasterCols[0]?.name || ''
                                                    };
                                                  }
                                                  setSections(updated);
                                                }}
                                                className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                                              >
                                                <option value="">-- بدون فیلتر وابسته --</option>
                                                {otherColsInRow.map(oc => (
                                                  <option key={oc.id} value={oc.id}>{oc.label} ({oc.id})</option>
                                                ))}
                                              </select>
                                            </div>
                                            {col.cascadingFilter?.sourceColId && (
                                              <div>
                                                <label className="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
                                                  ستون متناظر در جدول مرجع مقصد:
                                                </label>
                                                {colMasterCols.length > 0 ? (
                                                  <select
                                                    value={col.cascadingFilter?.targetMasterCol || ''}
                                                    onChange={(e) => {
                                                      const updated = [...sections];
                                                      updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter = {
                                                        ...(updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter || {}),
                                                        targetMasterCol: e.target.value
                                                      };
                                                      setSections(updated);
                                                    }}
                                                    className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 font-mono"
                                                  >
                                                    <option value="">-- انتخاب ستون مرجع --</option>
                                                    {colMasterCols.map(cmc => (
                                                      <option key={cmc.name} value={cmc.name}>{cmc.title} ({cmc.name})</option>
                                                    ))}
                                                    {col.cascadingFilter?.targetMasterCol && !colMasterCols.some(cmc => cmc.name === col.cascadingFilter.targetMasterCol) && (
                                                      <option value={col.cascadingFilter.targetMasterCol}>{col.cascadingFilter.targetMasterCol}</option>
                                                    )}
                                                  </select>
                                                ) : (
                                                  <input
                                                    type="text"
                                                    dir="ltr"
                                                    placeholder="مثلاً: partcode"
                                                    value={col.cascadingFilter?.targetMasterCol || ''}
                                                    onChange={(e) => {
                                                      const updated = [...sections];
                                                      updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter = {
                                                        ...(updated[secIndex].questions[qIndex].columns[cIdx].cascadingFilter || {}),
                                                        targetMasterCol: e.target.value
                                                      };
                                                      setSections(updated);
                                                    }}
                                                    className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 font-mono text-left"
                                                  />
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        {/* نگاشت Auto-Fill ستون‌های همان ردیف */}
                                        <div className="space-y-1.5 pt-1">
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-slate-600 dark:text-slate-300 font-semibold">
                                            <span>پرکردن خودکار سایر ستون‌های این ردیف (Row Auto-Fill):</span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const updated = [...sections];
                                                const maps = [...(updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping || [])];
                                                maps.push({ targetColId: otherColsInRow[0]?.id || '', sourceColumn: colMasterCols[0]?.name || '' });
                                                updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping = maps;
                                                setSections(updated);
                                              }}
                                              className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer self-start sm:self-auto"
                                            >
                                              + نگاشت ستون
                                            </button>
                                          </div>
                                          {(col.autoFillMapping || []).map((am, amIdx) => (
                                            <div key={amIdx} className="flex flex-col sm:flex-row sm:items-center gap-2 text-[11px] bg-white/80 dark:bg-[#252736] p-2 sm:p-1.5 rounded-lg border border-indigo-100 dark:border-slate-700">
                                              <span className="text-slate-400 shrink-0">مقدار ستون</span>
                                              <select
                                                value={am.targetColId}
                                                onChange={(e) => {
                                                  const updated = [...sections];
                                                  updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping[amIdx].targetColId = e.target.value;
                                                  setSections(updated);
                                                }}
                                                className="text-xs px-1.5 py-1 sm:py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-full sm:flex-1 min-w-0"
                                              >
                                                {otherColsInRow.map(oc => (
                                                  <option key={oc.id} value={oc.id}>{oc.label} ({oc.id})</option>
                                                ))}
                                                {am.targetColId && !otherColsInRow.some(oc => oc.id === am.targetColId) && (
                                                  <option value={am.targetColId}>{am.targetColId}</option>
                                                )}
                                              </select>
                                              <span className="text-slate-400 shrink-0">از</span>
                                              {colMasterCols.length > 0 ? (
                                                <select
                                                  value={am.sourceColumn}
                                                  onChange={(e) => {
                                                    const updated = [...sections];
                                                    updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping[amIdx].sourceColumn = e.target.value;
                                                    setSections(updated);
                                                  }}
                                                  className="text-xs px-1.5 py-1 sm:py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-full sm:flex-1 min-w-0 font-mono"
                                                >
                                                  {colMasterCols.map(cmc => (
                                                    <option key={cmc.name} value={cmc.name}>{cmc.title} ({cmc.name})</option>
                                                  ))}
                                                  {am.sourceColumn && !colMasterCols.some(cmc => cmc.name === am.sourceColumn) && (
                                                    <option value={am.sourceColumn}>{am.sourceColumn}</option>
                                                  )}
                                                </select>
                                              ) : (
                                                <input
                                                  type="text"
                                                  dir="ltr"
                                                  placeholder="نام ستون مرجع..."
                                                  value={am.sourceColumn || ''}
                                                  onChange={(e) => {
                                                    const updated = [...sections];
                                                    updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping[amIdx].sourceColumn = e.target.value;
                                                    setSections(updated);
                                                  }}
                                                  className="text-xs px-1.5 py-1 sm:py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-full sm:flex-1 min-w-0 font-mono text-left"
                                                />
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updated = [...sections];
                                                  const nextMaps = [...(updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping || [])];
                                                  nextMaps.splice(amIdx, 1);
                                                  updated[secIndex].questions[qIndex].columns[cIdx].autoFillMapping = nextMaps;
                                                  setSections(updated);
                                                }}
                                                className="text-rose-500 hover:text-rose-700 px-1 font-bold cursor-pointer self-end sm:self-center shrink-0"
                                                title="حذف نگاشت"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* اگر ستون محاسباتی باشد */}
                                    {col.type === 'calculated' && (
                                      <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-[#181926] border border-emerald-100 dark:border-emerald-900/60 space-y-1.5">
                                        <div className="flex items-center gap-2 text-[11px] text-emerald-900 dark:text-emerald-300 font-bold">
                                          <Calculator className="w-3.5 h-3.5" />
                                          <span>فرمول محاسباتی ردیف (مثال: ({'{Qty}'} * {'{ratio}'} * {'{Gr}'}) / 1000):</span>
                                        </div>
                                        <input
                                          type="text"
                                          dir="ltr"
                                          value={col.formula || ''}
                                          onChange={(e) => {
                                            const updated = [...sections];
                                            updated[secIndex].questions[qIndex].columns[cIdx].formula = e.target.value;
                                            setSections(updated);
                                          }}
                                          placeholder="({Qty} * {ratio} * {Gr}) / 1000"
                                          className="w-full text-xs font-mono px-2.5 py-1.5 rounded border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-left"
                                        />
                                        <div className="flex flex-wrap gap-1 pt-1">
                                          <span className="text-[10px] text-slate-400">درج ستون‌ها:</span>
                                          {otherColsInRow.map(oc => (
                                            <button
                                              key={oc.id}
                                              type="button"
                                              onClick={() => {
                                                const updated = [...sections];
                                                const cur = updated[secIndex].questions[qIndex].columns[cIdx].formula || '';
                                                const token = `{${oc.id}}`;
                                                updated[secIndex].questions[qIndex].columns[cIdx].formula = cur ? `${cur} ${token}` : token;
                                                setSections(updated);
                                              }}
                                              className="text-[10px] font-mono bg-white dark:bg-[#252736] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                                            >
                                              {oc.label} ({oc.id})
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-[11px] text-slate-400 block">
                              💡 کاربر هنگام تکمیل فرم می‌تواند با دکمه «+ افزودن سطر جدید» یا فشردن کلید Enter در آخرین سلول، سطر جدید اضافه کند.
                            </span>
                          </div>
                        )}

                        {/* فیلد متن ثابت / لیبل راهنما (Label) */}
                        {q.type === 'label' && (
                          <div className="mb-4 pr-1 space-y-2">
                            <div className="bg-slate-50 dark:bg-[#1e2030] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                              <div className="flex items-center gap-2 text-blue-600 dark:text-sky-400 text-xs font-bold">
                                <Info className="w-4 h-4 shrink-0" />
                                <span>پیش‌نمایش و تنظیمات متن ثابت / لیبل راهنما:</span>
                              </div>
                              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                {q.label || 'عنوان یا متن ثابت'}
                              </div>
                              <textarea
                                placeholder="توضیحات تکمیلی یا متن راهنما (اختیاری)..."
                                value={q.description || ''}
                                onChange={(e) => {
                                  const updated = [...sections];
                                  updated[secIndex].questions[qIndex].description = e.target.value;
                                  setSections(updated);
                                }}
                                rows={2}
                                className="w-full text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-[#252736] p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}

                        {q.type === 'date' && (
                          <div className="mb-4 pr-1">
                            <PersianDatePicker value="" onChange={() => {}} placeholder="روز / ماه / سال شمسی..." />
                          </div>
                        )}

                        {q.type === 'time' && (
                          <div className="mb-4 pr-1">
                            <input type="time" disabled className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 font-mono" />
                          </div>
                        )}

                        {/* فیلد عددی با واحد و حداکثر ارقام */}
                        {q.type === 'number' && (
                          <div className="mb-4 pr-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-semibold">واحد سنجش:</span>
                                <select
                                  value={['%', 'ریال', 'تومان', 'کیلوگرم', 'تعداد / عدد', 'متر'].includes(q.unit) ? q.unit : (q.unit ? 'custom' : '')}
                                  onChange={(e) => {
                                    const updated = [...sections];
                                    updated[secIndex].questions[qIndex].unit = e.target.value === 'custom' ? 'عدد' : e.target.value;
                                    setSections(updated);
                                  }}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-[#1e2030] dark:border-slate-700"
                                >
                                  <option value="">بدون واحد</option>
                                  <option value="%">% (درصد)</option>
                                  <option value="ریال">ریال</option>
                                  <option value="تومان">تومان</option>
                                  <option value="کیلوگرم">کیلوگرم</option>
                                  <option value="تعداد / عدد">تعداد / عدد</option>
                                  <option value="متر">متر</option>
                                  <option value="custom">سفارشی...</option>
                                </select>
                                {!['%', 'ریال', 'تومان', 'کیلوگرم', 'تعداد / عدد', 'متر', ''].includes(q.unit) && (
                                  <input
                                    type="text"
                                    placeholder="واحد دلخواه..."
                                    value={q.unit || ''}
                                    onChange={(e) => {
                                      const updated = [...sections];
                                      updated[secIndex].questions[qIndex].unit = e.target.value;
                                      setSections(updated);
                                    }}
                                    className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 w-28 bg-white dark:bg-[#1e2030] dark:border-slate-700"
                                  />
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 font-semibold">حداکثر ارقام:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="30"
                                  placeholder="مثلاً 10"
                                  value={q.maxDigits ?? ''}
                                  onChange={(e) => {
                                    const updated = [...sections];
                                    const parsed = e.target.value ? parseInt(e.target.value, 10) : '';
                                    updated[secIndex].questions[qIndex].maxDigits = parsed;
                                    setSections(updated);
                                  }}
                                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 w-20 bg-white dark:bg-[#1e2030] dark:border-slate-700 font-mono text-center"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {q.type === 'rating' && (
                          <div className="mb-4 pr-1 flex items-center gap-1 text-amber-400">
                            {[1, 2, 3, 4, 5].map(s => <Star key={s} className="w-5 h-5 fill-current" />)}
                            <span className="text-xs text-slate-400 mr-2">(مقیاس ۵ ستاره)</span>
                          </div>
                        )}

                        {q.type === 'file' && (
                          <div className="mb-4 pr-1">
                            <span className="text-xs text-slate-400 block mb-1">بارگذاری فایل توسط متقاضی (PDF, تصاویر, آفیس)</span>
                            <input type="file" disabled className="text-xs text-slate-400" />
                          </div>
                        )}

                        {(q.type === 'radio' || q.type === 'dropdown' || q.type === 'checkbox') && (
                          <div className="space-y-2 pr-2 mb-4">
                            {q.options?.map((opt, optIndex) => (
                              <div key={optIndex} className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded-full border border-slate-300 block"></span>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const updated = [...sections];
                                    updated[secIndex].questions[qIndex].options[optIndex] = e.target.value;
                                    setSections(updated);
                                  }}
                                  className="text-xs text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 py-1 flex-1 bg-transparent"
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...sections];
                                updated[secIndex].questions[qIndex].options.push(`گزینه ${q.options.length + 1}`);
                                setSections(updated);
                              }}
                              className="text-xs text-blue-600 dark:text-sky-400 hover:underline pt-1 block cursor-pointer"
                            >
                              + افزودن گزینه
                            </button>
                          </div>
                        )}
                      </div>

                      {/* نوار پایین کارت: انتخاب عرض فیلد، پاسخ الزامی، تکثیر و حذف */}
                      <div className={`flex flex-wrap items-center ${isNarrow ? 'justify-between gap-1.5' : 'justify-between gap-2'} pt-3 border-t border-slate-100 dark:border-slate-700/60 text-slate-400 mt-2 min-w-0 w-full`}>
                        {/* کلیدهای انتخاب عرض فیلد (چندستونه) */}
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10px] shrink-0">
                          <span className="text-slate-500 dark:text-slate-400 px-1 font-bold">عرض:</span>
                          <button
                            type="button"
                            onClick={() => updateWidth('1/1')}
                            className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                              (!q.width || q.width === '1/1')
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                            title="تمام‌عرض (۱/۱)"
                          >
                            ۱/۱
                          </button>
                          <button
                            type="button"
                            onClick={() => updateWidth('1/2')}
                            className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                              q.width === '1/2'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                            title="نیم‌عرض (۱/۲)"
                          >
                            ۱/۲
                          </button>
                          <button
                            type="button"
                            onClick={() => updateWidth('1/3')}
                            className={`px-1.5 py-0.5 rounded font-bold transition cursor-pointer ${
                              q.width === '1/3'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                            title="یک‌سوم عرض (۱/۳)"
                          >
                            ۱/۳
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {q.type !== 'label' && q.type !== 'section' && (
                            <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={q.required}
                                onChange={(e) => {
                                  const updated = [...sections];
                                  updated[secIndex].questions[qIndex].required = e.target.checked;
                                  setSections(updated);
                                }}
                                className="rounded text-blue-600"
                              />
                              <span>الزامی</span>
                            </label>
                          )}
                          <button
                            type="button"
                            onClick={() => duplicateQuestion(secIndex, qIndex)}
                            className="p-1 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="تکثیر این فیلد"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteQuestion(secIndex, qIndex)}
                            className="p-1 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                            title="حذف این فیلد"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
              )}

              {/* نوار فوتر داخل هر کادر سکشن: دکمه افزودن فیلد جدید */}
              {!isCollapsed && (sec.questions || []).length > 0 && (
                <div className="mt-4 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => addQuestion(secIndex, 'text')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-sky-400 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 border border-blue-200 dark:border-slate-700 px-3.5 py-2 rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>افزودن فیلد به این کادر سکشن</span>
                  </button>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {(sec.questions || []).length} فیلد در این کادر
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* دکمه افزودن کادر سکشن جدید */}
      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={addSection}
          className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-sky-400 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700/80 border-2 border-dashed border-blue-300 dark:border-blue-700/60 px-6 py-3 rounded-2xl transition cursor-pointer shadow-xs hover:shadow-md"
        >
          <Layers className="w-5 h-5 text-blue-600 dark:text-sky-400" />
          <span>افزودن کادر سکشن جدید (Section Container)</span>
        </button>
      </div>

      {/* کارت قوانین اعتبارسنجی فرمولی پیش از ارسال فرم (Validation Rules) */}
      <div className="bg-white dark:bg-[#252736] rounded-2xl p-3.5 sm:p-6 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/80">
          <div className="min-w-0">
            <h4 className="font-bold text-sm sm:text-base text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>قوانین اعتبارسنجی فرمولی پیش از ارسال (Validation Rules)</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                اختیاری ({(validationRules || []).length} قانون)
              </span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              این قوانین هنگام پرکردن فرم به صورت زنده بررسی می‌شوند. تا زمانی که تمام شروط برقرار نباشد، هشدار خطا نمایش داده شده و دکمه ثبت غیرفعال می‌ماند.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setValidationRules([
                ...(validationRules || []),
                {
                  id: `rule_${Date.now()}`,
                  formula: '',
                  errorMessage: ''
                }
              ]);
            }}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/70 px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0 self-stretch sm:self-center"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن قانون اعتبارسنجی</span>
          </button>
        </div>

        {(!validationRules || validationRules.length === 0) ? (
          <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-[#1e2030] border border-dashed border-slate-200 dark:border-slate-700 text-center text-xs text-slate-400">
            هیچ قانون اعتبارسنجی فرمولی تعریف نشده است. فرم بدون محدودیت فرمولی ارسال خواهد شد.
          </div>
        ) : (
          <div className="space-y-4">
            {validationRules.map((rule, rIdx) => {
              const syntaxCheck = (rule.formula || '').trim()
                ? evaluateValidationFormula(rule.formula, {}, sections)
                : { isValid: true, error: null };

              return (
                <div
                  key={rule.id || rIdx}
                  className="p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-[#1e2030] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                        قانون #{rIdx + 1}
                      </span>
                      {(rule.formula || '').trim() && (
                        syntaxCheck.error ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            خطای سینتکس: {syntaxCheck.error}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            سینتکس فرمول معتبر
                          </span>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setValidationRules(validationRules.filter((_, i) => i !== rIdx))}
                      className="inline-flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 font-medium cursor-pointer self-end sm:self-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف قانون</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      عبارت شرطی فرمول (پشتیبانی از عملگرهای ==، !=، &gt;، &lt;، &gt;=، &lt;=، +، -، *، / و توابع SUM و COUNT):
                    </label>
                    <input
                      id={`val-rule-formula-${rule.id || rIdx}`}
                      type="text"
                      dir="ltr"
                      value={rule.formula || ''}
                      onChange={(e) => {
                        const updated = [...validationRules];
                        updated[rIdx] = { ...updated[rIdx], formula: e.target.value };
                        setValidationRules(updated);
                      }}
                      placeholder="مثال: {PHrs} + ({PMins} / 60) + {IHrs} + ({IMins} / 60) == 8"
                      className="w-full text-left font-mono text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* دکمه‌های درج سریع عملگرها، فیلدهای عددی و جداول */}
                  <div className="p-3 rounded-xl bg-white dark:bg-[#252736] border border-slate-200 dark:border-slate-700/80 space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">
                      درج سریع در فرمول:
                    </span>
                    <div className="flex flex-wrap gap-1" dir="ltr">
                      {['==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/', '(', ')'].map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => insertTokenToValidationRule(rIdx, op)}
                          className="px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-mono font-bold hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-300 transition cursor-pointer"
                        >
                          {op}
                        </button>
                      ))}
                    </div>

                    {numericFields.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-400 block">فیلدهای عددی فرم:</span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {numericFields.map(nf => (
                            <button
                              key={nf.id}
                              type="button"
                              onClick={() => insertTokenToValidationRule(rIdx, `{${nf.id}}`)}
                              className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-[10px] font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition cursor-pointer inline-flex items-center gap-1"
                              title={`درج {${nf.id}}`}
                            >
                              <Hash className="w-2.5 h-2.5" />
                              <span>{nf.label}</span>
                              <span className="font-mono text-[9px] opacity-75">({nf.id})</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {tables.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <span className="text-[10px] text-slate-400 block">توابع جداول اقلام (SUM و COUNT):</span>
                        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                          {tables.map(tbl => (
                            <button
                              key={tbl.id}
                              type="button"
                              onClick={() => insertTokenToValidationRule(rIdx, `COUNT(${tbl.id})`)}
                              className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[10px] font-mono hover:bg-purple-100 dark:hover:bg-purple-900/40 transition cursor-pointer"
                              title={`تعداد ردیف‌های جدول ${tbl.label}`}
                            >
                              COUNT({tbl.id})
                            </button>
                          ))}
                          {tableColumns.filter(tc => tc.isNumeric).map((tc, tcIdx) => (
                            <button
                              key={`${tc.tableId}_${tc.columnId}_${tcIdx}`}
                              type="button"
                              onClick={() => insertTokenToValidationRule(rIdx, `SUM(${tc.tableId}.${tc.columnId})`)}
                              className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition cursor-pointer"
                              title={`مجموع ستون «${tc.columnLabel}» از جدول «${tc.tableLabel}»`}
                            >
                              SUM({tc.tableId}.{tc.columnId})
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      پیام خطای فارسی اختصاصی در صورت عدم برقراری شرط:
                    </label>
                    <input
                      type="text"
                      dir="rtl"
                      value={rule.errorMessage || ''}
                      onChange={(e) => {
                        const updated = [...validationRules];
                        updated[rIdx] = { ...updated[rIdx], errorMessage: e.target.value };
                        setValidationRules(updated);
                      }}
                      placeholder="مثلاً: مجموع ساعات کارکرد مفید و توقفات شیفت باید دقیقاً برابر ۸ ساعت باشد."
                      className="w-full text-right text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* پنل ماتریس گردش کار و تاییدات ترتیبی با بازطراحی کامل */}
      {!formIsPublic && (
        <div className="bg-white dark:bg-[#252736] rounded-2xl p-6 border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/80">
            <div>
              <h4 className="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>ماتریس تاییدات ترتیبی و گردش کار (Workflow Engine)</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                در صورت عدم تعریف مرحله، فرم به عنوان «ثبت مستقیم» کار خواهد کرد و نیازی به تایید ندارد.
              </p>
            </div>
          </div>

          {/* مراحل گردش کار */}
          <div className="space-y-4">
            {workflowSteps.map((step, idx) => (
              <div key={idx} className="p-4 border border-slate-200 dark:border-slate-700 rounded-2xl bg-slate-50/60 dark:bg-[#1e2030] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">گام {idx + 1}:</span>
                  <button
                    type="button"
                    onClick={() => setWorkflowSteps(workflowSteps.filter((_, i) => i !== idx))}
                    className="text-xs text-rose-500 hover:text-rose-700 font-medium cursor-pointer"
                  >
                    حذف مرحله
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">عنوان مرحله:</label>
                    <input
                      type="text"
                      placeholder="مثلاً: تایید سرپرست واحد"
                      value={step.stepName}
                      onChange={(e) => {
                        const updated = [...workflowSteps];
                        updated[idx].stepName = e.target.value;
                        setWorkflowSteps(updated);
                      }}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">انتخاب مسئولین تایید (یک یا چند نفر/گروه):</label>
                    <div className="flex gap-2">
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const [type, idStr] = val.split(':');
                          const id = parseInt(idStr, 10);
                          const currentApprovers = step.approvers || [];
                          if (!currentApprovers.some(a => a.type === type && a.id === id)) {
                            const updated = [...workflowSteps];
                            updated[idx].approvers = [...currentApprovers, { type, id }];
                            setWorkflowSteps(updated);
                          }
                        }}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-800 dark:text-slate-100"
                      >
                        <option value="">+ افزودن فرد یا گروه به این مرحله...</option>
                        <optgroup label="گروه‌های سازمانی">
                          {groups.map(g => (
                            <option key={`Group:${g.groupID || g.groupId}`} value={`Group:${g.groupID || g.groupId}`}>
                              گروه: {g.groupName}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="کاربران مشخص">
                          {activeUsersList.map(u => <option key={`User:${u.userID}`} value={`User:${u.userID}`}>کاربر: {u.displayName || u.username}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                </div>

                {/* برچسب‌های مسئولین انتخاب‌شده برای مرحله */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(step.approvers || []).map((app, appIdx) => {
                    const name = app.type === 'Group' 
                      ? (groups.find(g => (g.groupID || g.groupId) == app.id)?.groupName || `گروه ${app.id}`)
                      : (usersList.find(u => u.userID == app.id)?.displayName || `کاربر ${app.id}`);
                    return (
                      <span key={appIdx} className="inline-flex items-center gap-1.5 bg-white dark:bg-[#252736] border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg text-xs text-slate-700 dark:text-slate-200 shadow-2xs">
                        {app.type === 'Group' ? <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...workflowSteps];
                            updated[idx].approvers = step.approvers.filter((_, i) => i !== appIdx);
                            setWorkflowSteps(updated);
                          }}
                          className="text-slate-400 hover:text-rose-600 mr-1 cursor-pointer"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* شروط تایید با ادبیات کاملاً فارسی و بدون اصطلاحات لاتین */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">قاعده تایید در صورت وجود چند مسئول:</span>
                  <div className="flex flex-col sm:flex-row gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <input
                        type="radio"
                        name={`rule_${idx}`}
                        checked={step.approvalRule === 'ANY'}
                        onChange={() => {
                          const updated = [...workflowSteps];
                          updated[idx].approvalRule = 'ANY';
                          setWorkflowSteps(updated);
                        }}
                        className="text-blue-600"
                      />
                      <span>تایید یکی از این افراد یا گروه‌ها کافی است (تایید اولویت‌دار)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <input
                        type="radio"
                        name={`rule_${idx}`}
                        checked={step.approvalRule === 'ALL'}
                        onChange={() => {
                          const updated = [...workflowSteps];
                          updated[idx].approvalRule = 'ALL';
                          setWorkflowSteps(updated);
                        }}
                        className="text-blue-600"
                      />
                      <span>تایید تمامی افراد و گروه‌های انتخاب‌شده الزامی است (تایید همگانی)</span>
                    </label>
                  </div>
                </div>

                {/* شروط مقداری چندگانه اختیاری با ترکیب منطقی AND / OR */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      شروط ورود به این مرحله ({(step.conditions || []).length === 0 ? 'بدون شرط - همیشه اجرا می‌شود' : `${step.conditions.length} شرط تعریف‌شده`}):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...workflowSteps];
                        const curr = updated[idx].conditions || [];
                        const firstField = availableConditionFields[0]?.id || '';
                        updated[idx].conditions = [...curr, { field: firstField, operator: '==', value: '' }];
                        if (!updated[idx].conditionLogic) updated[idx].conditionLogic = 'AND';
                        setWorkflowSteps(updated);
                      }}
                      className="text-[11px] bg-blue-50 dark:bg-blue-500/15 hover:bg-blue-100 dark:hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
                    >
                      + افزودن شرط
                    </button>
                  </div>

                  {(step.conditions || []).length > 1 && (
                    <div className="flex items-center gap-3 bg-white dark:bg-[#252736] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">نحوه ترکیب شروط:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`cond_logic_${idx}`}
                          checked={(step.conditionLogic || 'AND') === 'AND'}
                          onChange={() => {
                            const updated = [...workflowSteps];
                            updated[idx].conditionLogic = 'AND';
                            setWorkflowSteps(updated);
                          }}
                          className="text-blue-600"
                        />
                        <span className="font-bold text-slate-700 dark:text-slate-200">همه شروط برقرار باشند (و / AND)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`cond_logic_${idx}`}
                          checked={step.conditionLogic === 'OR'}
                          onChange={() => {
                            const updated = [...workflowSteps];
                            updated[idx].conditionLogic = 'OR';
                            setWorkflowSteps(updated);
                          }}
                          className="text-blue-600"
                        />
                        <span className="font-bold text-slate-700 dark:text-slate-200">حداقل یکی از شروط برقرار باشد (یا / OR)</span>
                      </label>
                    </div>
                  )}

                  {(step.conditions || []).map((cond, cIdx) => {
                    const selectedFieldMeta = availableConditionFields.find(f => f.id === cond.field);
                    return (
                      <div key={cIdx} className="flex items-center gap-2 flex-wrap bg-white dark:bg-[#252736] p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[11px] font-mono text-slate-400">#{cIdx + 1}</span>
                        <select
                          value={cond.field}
                          onChange={(e) => {
                            const updated = [...workflowSteps];
                            updated[idx].conditions[cIdx].field = e.target.value;
                            setWorkflowSteps(updated);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 flex-1 min-w-[160px]"
                        >
                          {availableConditionFields.map(f => (
                            <option key={f.id} value={f.id}>{f.label} ({f.type})</option>
                          ))}
                        </select>

                        <select
                          value={cond.operator}
                          onChange={(e) => {
                            const updated = [...workflowSteps];
                            updated[idx].conditions[cIdx].operator = e.target.value;
                            setWorkflowSteps(updated);
                          }}
                          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 font-mono"
                        >
                          <option value="==">== برابر با</option>
                          <option value="!=">!= مخالف با</option>
                          <option value=">">{'>'} بزرگتر از / بعد از</option>
                          <option value="<">{'<'} کوچکتر از / قبل از</option>
                          <option value=">=">{'>='} بزرگتر مساوی</option>
                          <option value="<=">{'<='} کوچکتر مساوی</option>
                          <option value="contains">شامل متن</option>
                        </select>

                        <input
                          type="text"
                          placeholder={selectedFieldMeta?.type === 'date' ? '1405/08/22 یا @TODAY' : 'مقدار مقایسه...'}
                          value={cond.value}
                          onChange={(e) => {
                            const updated = [...workflowSteps];
                            updated[idx].conditions[cIdx].value = e.target.value;
                            setWorkflowSteps(updated);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 w-36 font-mono"
                        />

                        {selectedFieldMeta?.type === 'date' && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...workflowSteps];
                              updated[idx].conditions[cIdx].value = '@TODAY';
                              setWorkflowSteps(updated);
                            }}
                            className="text-[11px] bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-500/25 cursor-pointer"
                            title="مقایسه پویا با تاریخ روز ثبت فرم"
                          >
                            تاریخ امروز
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...workflowSteps];
                            updated[idx].conditions = updated[idx].conditions.filter((_, i) => i !== cIdx);
                            setWorkflowSteps(updated);
                          }}
                          className="text-slate-400 hover:text-rose-600 px-1.5 font-bold cursor-pointer"
                          title="حذف شرط"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => {
                setWorkflowSteps([
                  ...workflowSteps,
                  {
                    stepIndex: workflowSteps.length,
                    stepName: `مرحله ${workflowSteps.length + 1}`,
                    approvers: [],
                    approvalRule: 'ANY',
                    conditionLogic: 'AND',
                    conditions: []
                  }
                ]);
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-bold flex items-center gap-1 pt-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن مرحله تایید متوالی جدید</span>
            </button>
          </div>

          {/* ارسال رونوشت خودکار (CC) با دیزاین جدید و تفکیک کاربر و گروه */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-700/80 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">ارسال رونوشت خودکار (CC):</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <select
                  value=""
                  onChange={(e) => {
                    const uid = parseInt(e.target.value, 10);
                    if (uid && !defaultCcUserIds.includes(uid)) {
                      setDefaultCcUserIds([...defaultCcUserIds, uid]);
                    }
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                >
                  <option value="">+ افزودن کاربر به لیست رونوشت...</option>
                  {activeUsersList.map(u => <option key={u.userID} value={u.userID}>{u.displayName || u.username}</option>)}
                </select>
              </div>

              <div>
                <select
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    const gid = parseInt(val, 10);
                    if (gid && !defaultCcGroupIds.includes(gid)) {
                      setDefaultCcGroupIds([...defaultCcGroupIds, gid]);
                    }
                  }}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100"
                >
                  <option value="">+ افزودن گروه به لیست رونوشت...</option>
                  {groups.map(g => {
                    const id = g.groupID || g.groupId;
                    return <option key={id} value={id}>{g.groupName}</option>;
                  })}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {defaultCcUserIds.map(uid => (
                <span key={`u_${uid}`} className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-lg text-xs font-medium">
                  <Users className="w-3.5 h-3.5" />
                  <span>رونوشت به: {usersList.find(u => u.userID === uid)?.displayName || `کاربر ${uid}`}</span>
                  <button type="button" onClick={() => setDefaultCcUserIds(defaultCcUserIds.filter(id => id !== uid))} className="text-blue-400 hover:text-rose-600 mr-1 cursor-pointer">×</button>
                </span>
              ))}

              {defaultCcGroupIds.map(gid => (
                <span key={`g_${gid}`} className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-lg text-xs font-medium">
                  <Shield className="w-3.5 h-3.5" />
                  <span>رونوشت به گروه: {groups.find(g => (g.groupID || g.groupId) == gid)?.groupName || `گروه ${gid}`}</span>
                  <button type="button" onClick={() => setDefaultCcGroupIds(defaultCcGroupIds.filter(id => id !== gid))} className="text-blue-400 hover:text-rose-600 mr-1 cursor-pointer">×</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 pt-4">
        <button
          type="button"
          disabled={savingForm}
          onClick={handleSaveAndPublishClick}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl transition shadow-lg text-sm cursor-pointer"
        >
          {savingForm ? 'در حال ذخیره...' : (editingFormId ? 'ذخیره و انتشار نگارش جدید' : 'ذخیره و انتشار نهایی فرم')}
        </button>
      </div>

      {/* مودال مشاهده و ویرایش زنده کد JSON فرم */}
      {jsonModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1f2030] w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/80 flex items-center justify-center text-blue-600 dark:text-sky-400">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">کد JSON و ساختار فرم</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">مشاهده، کپی و ویرایش مستقیم ساختار فرم یا بارگذاری فایل JSON</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setJsonModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {jsonError && (
                <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{jsonError}</div>
                </div>
              )}

              {jsonSuccess && (
                <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium">{jsonSuccess}</span>
                </div>
              )}

              <div className="relative">
                <textarea
                  value={jsonText}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    if (jsonError) setJsonError('');
                  }}
                  className="font-mono text-xs leading-relaxed p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 w-full h-[400px] focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-auto resize-none selection:bg-blue-600 selection:text-white"
                  dir="ltr"
                  spellCheck="false"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className={`flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl transition font-medium border ${
                    jsonCopied
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {jsonCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{jsonCopied ? 'کد JSON کپی شد!' : 'کپی کد JSON'}</span>
                </button>

                <input
                  type="file"
                  ref={jsonFileInputRef}
                  accept=".json"
                  onChange={handleJsonFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => jsonFileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 px-3.5 py-2 rounded-xl transition font-medium"
                >
                  <FileUp className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                  <span>بارگذاری از فایل (.json)</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJsonModalOpen(false)}
                  className="text-xs px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={handleApplyJsonToForm}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-xl transition shadow-sm"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>اعمال تغییرات JSON روی فرم</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال الگوبرداری از فرم‌های موجود */}
      {cloneModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1f2030] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CopyPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">الگوبرداری از فرم‌های موجود</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">ایجاد یک فرم کاملاً مستقل از روی فرم‌ها و نگارش‌های قبلی سیستم</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCloneModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#1f2030]">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cloneSearch}
                  onChange={(e) => setCloneSearch(e.target.value)}
                  placeholder="جستجو در عنوان یا کد فرم..."
                  className="w-full pr-10 pl-4 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {forms
                .filter(f => !cloneSearch || f.title?.toLowerCase().includes(cloneSearch.toLowerCase()) || f.formCode?.toLowerCase().includes(cloneSearch.toLowerCase()))
                .map(formItem => {
                  const fid = formItem.formID || formItem.id;
                  return (
                    <div
                      key={fid}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/40 hover:border-emerald-300 dark:hover:border-emerald-600/50 hover:shadow-sm transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"
                    >
                      <div className="space-y-1 min-w-0 w-full sm:w-auto">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200 break-words">
                            {formItem.title}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                            {formItem.formCode}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-semibold whitespace-nowrap shrink-0">
                            نگارش {formItem.version || 1}.{formItem.revision || 0}
                          </span>
                        </div>
                        {formItem.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {formItem.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (onCloneAsIndependentForm) {
                            onCloneAsIndependentForm(formItem);
                          }
                          setCloneModalOpen(false);
                        }}
                        className="w-full sm:w-auto justify-center shrink-0 flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 sm:py-1.5 rounded-xl font-medium shadow-sm transition cursor-pointer"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                        <span>انتخاب و الگوبرداری</span>
                      </button>
                    </div>
                  );
                })}

              {forms.filter(f => !cloneSearch || f.title?.toLowerCase().includes(cloneSearch.toLowerCase()) || f.formCode?.toLowerCase().includes(cloneSearch.toLowerCase())).length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  فرمی جهت الگوبرداری یافت نشد.
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex justify-end">
              <button
                type="button"
                onClick={() => setCloneModalOpen(false)}
                className="text-xs px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال بازبینی قالب‌های چاپ در فرم‌ساز */}
      {printDesignerModalOpen && (
        <ErrorBoundary
          title="طراح قالب چاپ در فرم‌ساز"
          onClose={() => setPrintDesignerModalOpen(false)}
        >
          <PrintTemplateDesignerModal
            isOpen={printDesignerModalOpen}
            onClose={() => setPrintDesignerModalOpen(false)}
            form={{
              formID: editingFormId || 0,
              title: formTitle || 'فرم جاری',
              schemaJson: JSON.stringify({
                title: formTitle,
                sections: sections,
                printTemplates: printTemplates
              })
            }}
            branding={branding}
            onSave={(updatedTemplates) => {
              if (setPrintTemplates) {
                setPrintTemplates(updatedTemplates);
              }
            }}
          />
        </ErrorBoundary>
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
