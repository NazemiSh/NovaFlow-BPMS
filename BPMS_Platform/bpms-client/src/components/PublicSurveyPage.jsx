import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import { Layers, Clock, XCircle, CheckCircle2, ShieldCheck, RefreshCw } from 'lucide-react';
import DynamicFormRenderer, { ValidationRulesAlert } from './DynamicFormRenderer';
import { evaluateValidationRules } from '../utils/formulaEvaluator';

export default function PublicSurveyPage({
  form = {},
  onSubmit = async () => {},
  branding = {}
}) {
  const [currentSecIdx, setCurrentSecIdx] = useState(0);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captcha, setCaptcha] = useState(null);
  const [captchaInput, setCaptchaInput] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const fetchCaptcha = async () => {
    try {
      setLoadingCaptcha(true);
      const res = await api.get('/forms/public/captcha');
      if (res.data) {
        setCaptcha(res.data);
        setCaptchaInput('');
      }
    } catch (e) {
      console.error('Error fetching captcha:', e);
    } finally {
      setLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    fetchCaptcha();
  }, []);

  const parsedSchema = form.parsedSchema || {};
  const sections = useMemo(() => parsedSchema.sections || [], [parsedSchema.sections]);
  const currentSection = sections[currentSecIdx];

  const surveyValidation = useMemo(() => {
    return evaluateValidationRules(
      parsedSchema.validationRules || [],
      formData,
      sections
    );
  }, [parsedSchema.validationRules, formData, sections]);

  const handleFieldChange = (fieldOrUpdates, val, extraUpdates) => {
    setError('');
    setFormData(prev => {
      if (typeof fieldOrUpdates === 'object' && fieldOrUpdates !== null) {
        return { ...prev, ...fieldOrUpdates };
      }
      const next = { ...prev, [fieldOrUpdates]: val };
      if (extraUpdates && typeof extraUpdates === 'object') {
        Object.assign(next, extraUpdates);
      }
      return next;
    });
  };

  const handleNextOrSubmit = async () => {
    if (!currentSection) return;

    // Validation
    for (const q of currentSection.questions || []) {
      if (q.type === 'label' || q.type === 'section' || q.type === 'sectionContainer') continue;
      const val = formData[q.id];
      const isEmpty = val === undefined || val === null || (Array.isArray(val) ? val.length === 0 : String(val).trim() === '');
      if (q.required && isEmpty) {
        setError(`پاسخ به سوال «${q.label}» الزامی است.`);
        return;
      }
      if (q.type === 'number' && q.maxDigits && val) {
        const digitsOnly = String(val).replace(/\D/g, '');
        if (digitsOnly.length > q.maxDigits) {
          setError(`تعداد ارقام فیلد «${q.label}» نمی‌تواند بیش از ${q.maxDigits} رقم باشد.`);
          return;
        }
      }
    }

    if (currentSecIdx < sections.length - 1) {
      setCurrentSecIdx(currentSecIdx + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (!surveyValidation.isValid) {
        setError(surveyValidation.failedRules[0]?.errorMessage || 'شرط اعتبارسنجی فرمولی فرم برقرار نیست.');
        return;
      }
      if (!captchaInput.trim()) {
        setError('لطفاً کد امنیتی ۵ رقمی را وارد کنید.');
        return;
      }
      setSubmitting(true);
      setError('');
      try {
        await onSubmit(formData, {
          captchaToken: captcha?.token,
          captchaAnswer: captchaInput.trim(),
          honeypot: honeypot
        });
        setSubmitted(true);
      } catch (err) {
        setError(err.response?.data?.message || err.message || 'خطا در ثبت اطلاعات نظرسنجی.');
        fetchCaptcha();
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-[#1b1c29] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#252736] max-w-md w-full rounded-3xl p-8 text-center space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">پاسخ شما با موفقیت ثبت شد</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            از اینکه وقت ارزشمند خود را برای تکمیل این فرم صرف نمودید، سپاسگزاریم.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#1b1c29] py-8 px-4 flex justify-center font-sans">
      {/* فیلد مخفی تله ربات (Honeypot) - کاملاً نامرئی برای کاربر حقیقی */}
      <div style={{ opacity: 0, position: 'absolute', top: 0, left: '-9999px', height: 0, width: 0, zIndex: -1, overflow: 'hidden' }} aria-hidden="true">
        <input
          type="text"
          name="bpms_security_honey_check"
          tabIndex="-1"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="w-full max-w-4xl xl:max-w-5xl space-y-5">
        <div className="bg-white dark:bg-[#252736] border-t-8 border-blue-600 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            {(branding.logoUrl || form.logoUrl) ? (
              <img
                src={branding.logoUrl || form.logoUrl}
                alt="Logo"
                className="w-12 h-12 object-contain rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-1 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-md shrink-0">
                <Layers className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{form.title || 'نظرسنجی عمومی'}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{form.description || 'لطفاً به تمامی سوالات با دقت پاسخ دهید.'}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 px-4 py-3 rounded-2xl text-xs flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {currentSection && (
          <div className="space-y-4">
            <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white p-4 rounded-2xl shadow-sm">
              <span className="text-xs text-blue-100 font-bold block mb-1">
                مرحله {currentSecIdx + 1} از {sections.length}
              </span>
              <h4 className="font-bold text-white text-base">{currentSection.title}</h4>
              {currentSection.description && (
                <p className="text-xs text-blue-100/90 mt-1 leading-relaxed whitespace-pre-wrap">{currentSection.description}</p>
              )}
            </div>

            <DynamicFormRenderer
              questions={currentSection.questions || []}
              formData={formData}
              validationRules={parsedSchema.validationRules || []}
              allSections={sections}
              showValidationAlert={false}
              onChange={handleFieldChange}
            />

            {/* بخش کد امنیتی (کپچای آفلاین تصویری) در انتهای فرم */}
            {currentSecIdx === sections.length - 1 && (
              <div className="bg-slate-50 dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      کد امنیتی ضد ربات (کپچای تصویری آفلاین)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchCaptcha}
                    disabled={loadingCaptcha}
                    className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title="دریافت کد جدید"
                    aria-label="تازه‌سازی کد امنیتی"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingCaptcha ? 'animate-spin' : ''}`} />
                    <span>کد جدید</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="shrink-0 flex items-center justify-center p-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs select-none">
                    {loadingCaptcha ? (
                      <div className="w-[170px] h-[52px] flex items-center justify-center text-xs text-slate-400">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      </div>
                    ) : captcha?.imageUrl ? (
                      <img
                        src={captcha.imageUrl}
                        alt="کد امنیتی ۵ رقمی"
                        className="h-[52px] w-[170px] object-contain select-none pointer-events-none"
                      />
                    ) : captcha?.captchaSvg ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: captcha.captchaSvg }}
                        className="h-[52px] w-[170px] flex items-center justify-center select-none pointer-events-none"
                      />
                    ) : (
                      <div className="w-[170px] h-[52px] flex items-center justify-center font-mono font-bold text-slate-400">
                        ...
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={5}
                      value={captchaInput}
                      onChange={(e) => setCaptchaInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="کد ۵ رقمی داخل تصویر را وارد کنید"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono tracking-widest text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  جهت اطمینان از تکمیل فرم توسط کاربر حقیقی، ارقام ۵ رقمی نمایش‌داده‌شده در تصویر درهم‌ریخته فوق را در کادر تایپ نمایید.
                </p>
              </div>
            )}

            {currentSecIdx === sections.length - 1 && surveyValidation.hasRules && !surveyValidation.isValid && (
              <ValidationRulesAlert validation={surveyValidation} />
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={currentSecIdx === 0}
                onClick={() => {
                  setCurrentSecIdx(currentSecIdx - 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="text-xs text-slate-600 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                مرحله قبل
              </button>

              <button
                type="button"
                disabled={submitting || (currentSecIdx === sections.length - 1 && !surveyValidation.isValid)}
                onClick={handleNextOrSubmit}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs px-6 py-2.5 rounded-xl font-bold shadow-md cursor-pointer transition"
              >
                {submitting
                  ? 'در حال ثبت...'
                  : currentSecIdx < sections.length - 1
                  ? 'مرحله بعد'
                  : 'ثبت نهایی پاسخ'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
