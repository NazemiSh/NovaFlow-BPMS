import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Star, Info, Layers, ChevronDown, ChevronUp, Plus, Trash2, Database,
  Upload, Download, X, FileText, RefreshCw, FileSpreadsheet, Image as ImageIcon, AlertTriangle
} from 'lucide-react';
import PersianDatePicker from './PersianDatePicker';
import MasterLookupInput from './MasterLookupInput';
import api from '../api';
import { evaluateRowFormula, evaluateValidationRules, parseNumberSafe } from '../utils/formulaEvaluator';

const getRowDataValue = (rowData, colName) => {
  if (!rowData || typeof rowData !== 'object' || !colName) return undefined;
  if (rowData[colName] !== undefined) return rowData[colName];
  const target = String(colName).trim().toLowerCase();
  const matchedKey = Object.keys(rowData).find(k => k.trim().toLowerCase() === target);
  return matchedKey ? rowData[matchedKey] : undefined;
};

export function ValidationRulesAlert({ validation, className = '' }) {
  if (!validation || !validation.hasRules || validation.isValid || !validation.failedRules?.length) {
    return null;
  }

  return (
    <div
      role="alert"
      className={`bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl text-xs sm:text-sm flex items-start gap-2 sm:gap-2.5 shadow-sm ${className}`}
    >
      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
      <div className="space-y-0.5 sm:space-y-1 flex-1 min-w-0">
        <span className="font-bold block text-rose-900 dark:text-rose-100 leading-snug">
          عدم احراز شرط اعتبارسنجی فرم (تا برقراری شرط، دکمه ثبت غیرفعال است):
        </span>
        <ul className="space-y-0.5 list-disc list-inside text-[11px] sm:text-xs">
          {validation.failedRules.map((fr, idx) => (
            <li key={fr.id || idx} className="leading-snug sm:leading-relaxed font-medium">
              {fr.errorMessage}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function DynamicFormRenderer({
  questions = [],
  sections = null,
  section = null,
  formData = {},
  onChange = () => {},
  readOnly = false,
  errors = {},
  validationRules = [],
  allSections = null,
  onValidationChange = null,
  showValidationAlert = true
}) {
  const [collapsedSections, setCollapsedSections] = useState({});
  const [uploadingFields, setUploadingFields] = useState({});

  const actualQuestions = useMemo(() => {
    return (questions && questions.length > 0)
      ? questions
      : (section?.questions || []);
  }, [questions, section]);

  const validationSchemaContext = useMemo(() => {
    if (Array.isArray(allSections) && allSections.length > 0) return allSections;
    if (Array.isArray(sections) && sections.length > 0) return sections;
    return actualQuestions;
  }, [allSections, sections, actualQuestions]);

  const validationResult = useMemo(() => {
    if (!Array.isArray(validationRules) || validationRules.length === 0) {
      return { hasRules: false, isValid: true, failedRules: [] };
    }
    return evaluateValidationRules(validationRules, formData, validationSchemaContext);
  }, [validationRules, formData, validationSchemaContext]);

  useEffect(() => {
    if (typeof onValidationChange === 'function') {
      onValidationChange(validationResult);
    }
  }, [validationResult, onValidationChange]);

  // تجمیع فیلدها در قالب کادرهای سکشن واقعی (Section Container)
  const groupedStructure = useMemo(() => {
    const list = [];
    let currentContainer = null;

    (actualQuestions || []).forEach(q => {
      const isSec = q.type === 'section' || q.type === 'sectionContainer';
      if (isSec) {
        currentContainer = {
          section: q,
          fields: []
        };
        list.push(currentContainer);
      } else if (currentContainer) {
        currentContainer.fields.push(q);
      } else {
        const last = list[list.length - 1];
        if (last && !last.section) {
          last.fields.push(q);
        } else {
          list.push({
            section: null,
            fields: [q]
          });
        }
      }
    });

    return list;
  }, [actualQuestions]);

  const computeCellValue = (col, row, allCols) => {
    return evaluateRowFormula(col?.formula, row, allCols);
  };

  const handleFormKeyDown = (e) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
      const target = e.target;
      if (target.tagName === 'INPUT' && target.type !== 'submit' && target.type !== 'button') {
        const formElements = Array.from(e.currentTarget.querySelectorAll('input:not([disabled]):not([readonly]), select:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'));
        const index = formElements.indexOf(target);
        if (index > -1 && index + 1 < formElements.length) {
          e.preventDefault();
          formElements[index + 1].focus();
        }
      }
    }
  };

  const handleNumberChange = (q, rawVal) => {
    let val = rawVal;
    if (q.maxDigits && q.maxDigits > 0) {
      const digitsOnly = String(rawVal).replace(/\D/g, '');
      val = digitsOnly.slice(0, q.maxDigits);
    }
    onChange(q.id, val);
  };

  // رندر هر فیلد جداگانه فرم
  const renderField = (q) => {
    // محاسبه دقیق عرض ستون بر اساس ویژگی‌های width یا colSpan فرم‌ساز
    const isWideType = ['paragraph', 'label', 'file', 'upload', 'attachment', 'table', 'repeater_grid', 'section', 'sectionContainer', 'master_lookup'].includes(q.type);
    const rawWidth = q.width || q.colSpan;
    const fieldWidth = rawWidth || (isWideType ? '1/1' : '1/2');

    let widthClass = 'col-span-12';
    if (fieldWidth === '1/3' || fieldWidth === 4 || fieldWidth === 'col-span-4') {
      widthClass = 'col-span-12 md:col-span-4';
    } else if (fieldWidth === '1/2' || fieldWidth === 6 || fieldWidth === 'col-span-6') {
      widthClass = 'col-span-12 md:col-span-6';
    } else {
      widthClass = 'col-span-12';
    }

    // ۱. فیلد متن ثابت / لیبل راهنما (Label)
    if (q.type === 'label') {
      return (
        <div
          key={q.id}
          className={`${widthClass} min-w-0 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-50/70 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700/80 space-y-1.5 shadow-2xs`}
        >
          <div className="flex items-center gap-2 text-blue-950 dark:text-sky-300 font-bold text-sm">
            <Info className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
            <span>{q.label}</span>
          </div>
          {q.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pr-6 whitespace-pre-wrap">
              {q.description}
            </p>
          )}
        </div>
      );
    }

    // فیلد کادر سکشن تو در تو (Section Card / sectionContainer)
    if (q.type === 'section' || q.type === 'sectionContainer') {
      return (
        <div
          key={q.id}
          className="col-span-12 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border-2 border-dashed border-slate-300 dark:border-slate-600 space-y-1.5 shadow-2xs"
        >
          <div className="flex items-center gap-2 text-blue-600 dark:text-sky-400 font-bold text-sm">
            <Layers className="w-4 h-4 shrink-0" />
            <span>{q.label}</span>
          </div>
          {q.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {q.description}
            </p>
          )}
        </div>
      );
    }

    const value = formData[q.id] ?? '';
    const hasError = Boolean(errors[q.id]);

    // ۲. فیلد انتخاب از بانک داده‌های مرجع (Master Data Lookup)
    if (q.type === 'master_lookup') {
      return (
        <div
          key={q.id}
          className={`${widthClass} min-w-0 border rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white dark:bg-[#252736] space-y-2 transition shadow-2xs ${
            hasError ? 'border-rose-300 dark:border-rose-900 bg-rose-50/30' : 'border-slate-200 dark:border-slate-700/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              {q.label} {q.required && <span className="text-rose-500 font-bold">*</span>}
            </label>
          </div>
          {q.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{q.description}</p>
          )}

          <MasterLookupInput
            tableId={q.masterTableId}
            tableCode={q.masterTableCode}
            value={value}
            disabled={readOnly}
            displayColumn={q.displayColumn}
            displayMode={q.displayMode}
            hasAutoFill={Boolean(q.autoFillMapping && q.autoFillMapping.length > 0)}
            placeholder={q.placeholder || `انتخاب ${q.label}...`}
            onChange={(keyVal, rowData) => {
              const updates = { [q.id]: keyVal };
              if (q.autoFillMapping && Array.isArray(q.autoFillMapping)) {
                q.autoFillMapping.forEach(m => {
                  if (!m.formFieldId || !m.sourceColumn) return;
                  if (!keyVal) {
                    updates[m.formFieldId] = '';
                  } else if (rowData) {
                    const mappedVal = getRowDataValue(rowData, m.sourceColumn);
                    if (mappedVal !== undefined) {
                      updates[m.formFieldId] = mappedVal;
                    }
                  }
                });
              }
              onChange(q.id, keyVal, updates);
            }}
          />

          {hasError && (
            <span className="text-xs text-rose-600 dark:text-rose-400 block pt-1 font-medium">
              {errors[q.id]}
            </span>
          )}
        </div>
      );
    }

    // ۳. فیلد جدول اقلام / چندسطری پویا (Repeating Table & Repeater Grid)
    if (q.type === 'table' || q.type === 'repeater_grid') {
      const rows = Array.isArray(value) ? value : [];
      const columns = q.columns && q.columns.length > 0
        ? q.columns
        : [
            { id: 'col_1', label: 'شرح قلم', type: 'text' },
            { id: 'col_2', label: 'تعداد / مقدار', type: 'number', includeInTotal: true },
            { id: 'col_3', label: 'تاریخ تحویل', type: 'date' }
          ];

      // شناسایی ستون‌های نگاشت‌شده از مرجع (Auto-Fill)
      const autoFillTargetColIds = new Set();
      columns.forEach(c => {
        if (c.type === 'master_lookup' && Array.isArray(c.autoFillMapping)) {
          c.autoFillMapping.forEach(am => {
            if (am.targetColId) autoFillTargetColIds.add(am.targetColId);
          });
        }
      });

      const isColAutoFilled = (col) => autoFillTargetColIds.has(col.id);
      const isColEditable = (col) => {
        if (readOnly) return false;
        if (col.type === 'calculated') return false;
        if (col.readOnly === true) return false;
        if (autoFillTargetColIds.has(col.id)) return false;
        return true;
      };

      const editableCols = columns.filter(isColEditable);

      const focusCell = (rIdx, colId) => {
        setTimeout(() => {
          const cellDomId = `rg_cell_${q.id}_${rIdx}_${colId}`;
          const el = document.getElementById(cellDomId);
          if (el) {
            el.focus();
            if (el.getAttribute('data-lookup-trigger') === 'true') {
              el.click();
            } else if (typeof el.select === 'function') {
              el.select();
            }
          }
        }, 40);
      };

      const recomputeRowCalculated = (targetRow) => {
        // دو پاس برای پشتیبانی از وابستگی ستون‌های محاسباتی به یکدیگر در یک ردیف
        for (let pass = 0; pass < 2; pass++) {
          columns.forEach(c => {
            if (c.type === 'calculated') {
              targetRow[c.id] = computeCellValue(c, targetRow, columns);
            }
          });
        }
        return targetRow;
      };

      const handleRowChange = (rIdx, colId, cellVal, extraFields = {}) => {
        const nextRows = rows.map((r, i) => {
          if (i !== rIdx) return r;
          const prevVal = r[colId] ?? '';
          const valueChanged = String(prevVal) !== String(cellVal ?? '');
          const updatedRow = { ...r, [colId]: cellVal, ...extraFields };

          // در صورت تغییر ستون مبدا، مقادیر ستون‌های وابسته (Cascading) و فیلدهای Auto-Fill آن‌ها ریست می‌شوند
          if (valueChanged) {
            const resetQueue = [colId];
            const visited = new Set([colId]);
            while (resetQueue.length > 0) {
              const changedSourceId = resetQueue.shift();
              columns.forEach(depCol => {
                if (
                  depCol.id !== changedSourceId &&
                  depCol.cascadingFilter?.sourceColId === changedSourceId &&
                  !visited.has(depCol.id)
                ) {
                  visited.add(depCol.id);
                  updatedRow[depCol.id] = '';
                  if (Array.isArray(depCol.autoFillMapping)) {
                    depCol.autoFillMapping.forEach(am => {
                      if (am.targetColId && am.targetColId !== colId) {
                        updatedRow[am.targetColId] = '';
                      }
                    });
                  }
                  resetQueue.push(depCol.id);
                }
              });
            }
          }

          return recomputeRowCalculated(updatedRow);
        });
        onChange(q.id, nextRows, { [q.id]: nextRows });
      };

      const handleAddRow = (focusColId = null) => {
        const newRow = {};
        columns.forEach(c => {
          newRow[c.id] = c.defaultValue !== undefined && c.defaultValue !== null ? c.defaultValue : '';
        });
        recomputeRowCalculated(newRow);
        const newRowIdx = rows.length;
        const nextRows = [...rows, newRow];
        onChange(q.id, nextRows, { [q.id]: nextRows });

        const targetColId = focusColId || editableCols[0]?.id;
        if (targetColId) {
          setTimeout(() => {
            focusCell(newRowIdx, targetColId);
          }, 80);
        }
      };

      const handleDeleteRow = (rIdx) => {
        const nextRows = rows.filter((_, i) => i !== rIdx);
        onChange(q.id, nextRows, { [q.id]: nextRows });
      };

      const handleCellKeyDown = (e, rIdx, colId) => {
        const eColIdx = editableCols.findIndex(ec => ec.id === colId);
        if (eColIdx === -1) return;

        const isLastEditableCol = eColIdx === editableCols.length - 1;
        const isFirstEditableCol = eColIdx === 0;
        const isLastRow = rIdx === rows.length - 1;

        if (e.key === 'Tab') {
          if (e.shiftKey) {
            // Shift + Tab: پیمایش به عقب میان سلول‌های قابل ویرایش
            if (!isFirstEditableCol) {
              e.preventDefault();
              focusCell(rIdx, editableCols[eColIdx - 1].id);
            } else if (rIdx > 0) {
              e.preventDefault();
              focusCell(rIdx - 1, editableCols[editableCols.length - 1].id);
            }
          } else {
            // Tab: پیمایش هوشمند به جلو و پرش از روی ستون‌های قفل/خودکار
            if (!isLastEditableCol) {
              e.preventDefault();
              focusCell(rIdx, editableCols[eColIdx + 1].id);
            } else {
              // آخرین ستون قابل ویرایش سطر
              e.preventDefault();
              if (isLastRow) {
                handleAddRow(editableCols[0]?.id);
              } else {
                focusCell(rIdx + 1, editableCols[0]?.id);
              }
            }
          }
        } else if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          if (!isLastEditableCol) {
            focusCell(rIdx, editableCols[eColIdx + 1].id);
          } else {
            // آخرین ستون قابل ویرایش سطر
            if (isLastRow) {
              handleAddRow(editableCols[0]?.id);
            } else {
              focusCell(rIdx + 1, editableCols[0]?.id);
            }
          }
        } else if (e.altKey && e.key === 'Delete') {
          e.preventDefault();
          handleDeleteRow(rIdx);
        }
      };

      const handleLookupNextField = (rIdx, colId) => {
        const currentEColIdx = editableCols.findIndex(ec => ec.id === colId);
        if (currentEColIdx === -1) return;

        const nextColsInRow = editableCols.slice(currentEColIdx + 1);
        const currentRow = rows[rIdx] || {};
        const targetCol = nextColsInRow.find(ec => {
          const val = currentRow[ec.id];
          return val === undefined || val === null || val === '';
        }) || nextColsInRow[0];

        if (targetCol) {
          focusCell(rIdx, targetCol.id);
        } else if (rIdx < rows.length - 1) {
          focusCell(rIdx + 1, editableCols[0]?.id);
        }
      };

      const handleLookupPrevField = (rIdx, colId) => {
        const currentEColIdx = editableCols.findIndex(ec => ec.id === colId);
        if (currentEColIdx > 0) {
          focusCell(rIdx, editableCols[currentEColIdx - 1].id);
        } else if (rIdx > 0) {
          focusCell(rIdx - 1, editableCols[editableCols.length - 1]?.id);
        }
      };

      return (
        <div
          key={q.id}
          className={`${widthClass} min-w-0 border rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white dark:bg-[#252736] space-y-2.5 sm:space-y-3 transition shadow-2xs ${
            hasError ? 'border-rose-300 dark:border-rose-900 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700/80'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <label className="block text-sm font-bold text-slate-800 dark:text-slate-100">
                {q.label} {q.required && <span className="text-rose-500 font-bold">*</span>}
              </label>
              {q.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{q.description}</p>
              )}
            </div>
            <span className="text-[11px] sm:text-xs font-mono font-bold text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-sky-950/60 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg border border-blue-100 dark:border-sky-900 whitespace-nowrap shrink-0">
              {rows.length} سطر ثبت‌شده
            </span>
          </div>

          <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-700/80 rounded-xl">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100/90 dark:bg-[#1e2030] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2 sm:p-2.5 w-8 sm:w-10 text-center">#</th>
                  {columns.map(col => (
                    <th key={col.id} className="p-2 sm:p-2.5 min-w-[115px] sm:min-w-[120px] font-bold">
                      {col.label}
                    </th>
                  ))}
                  {!readOnly && <th className="p-2 sm:p-2.5 w-10 sm:w-12 text-center">عملیات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (readOnly ? 1 : 2)} className="p-0">
                      <div className="sticky right-0 w-[calc(100vw-4rem)] sm:w-full p-4 text-right sm:text-center text-slate-400 text-xs">
                        سطری در جدول ثبت نشده است. {!readOnly && 'برای ثبت اطلاعات روی «+ افزودن سطر جدید» کلیک فرمایید.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="p-2 text-center text-slate-400 font-mono">{rIdx + 1}</td>
                      {columns.map((col, colIdx) => {
                        const cellId = `rg_cell_${q.id}_${rIdx}_${col.id}`;
                        const isAutoFilled = isColAutoFilled(col);
                        const isCalculated = col.type === 'calculated';
                        const isEditable = isColEditable(col);
                        const sourceColDef = col.cascadingFilter?.sourceColId
                          ? columns.find(c => c.id === col.cascadingFilter.sourceColId)
                          : null;
                        const cascadingFilterProp = (col.type === 'master_lookup' && col.cascadingFilter?.sourceColId && col.cascadingFilter?.targetMasterCol)
                          ? {
                              targetColumn: col.cascadingFilter.targetMasterCol,
                              value: row[col.cascadingFilter.sourceColId] ?? '',
                              sourceLabel: sourceColDef?.label || col.cascadingFilter.sourceColId
                            }
                          : null;

                        return (
                          <td key={col.id} className="p-1.5">
                            {col.type === 'master_lookup' ? (
                              <MasterLookupInput
                                id={cellId}
                                tableId={col.masterTableId}
                                tableCode={col.masterTableCode}
                                value={row[col.id] ?? ''}
                                disabled={readOnly || col.readOnly}
                                displayColumn={col.displayColumn}
                                displayMode={col.displayMode}
                                hasAutoFill={Boolean(col.autoFillMapping && col.autoFillMapping.length > 0)}
                                cascadingFilter={cascadingFilterProp}
                                onNextField={() => handleLookupNextField(rIdx, col.id)}
                                onPrevField={() => handleLookupPrevField(rIdx, col.id)}
                                onChange={(keyVal, rowData) => {
                                  const extra = {};
                                  if (col.autoFillMapping && Array.isArray(col.autoFillMapping)) {
                                    col.autoFillMapping.forEach(am => {
                                      if (!am.targetColId || !am.sourceColumn) return;
                                      if (!keyVal) {
                                        extra[am.targetColId] = '';
                                      } else if (rowData) {
                                        const mappedVal = getRowDataValue(rowData, am.sourceColumn);
                                        if (mappedVal !== undefined) {
                                          extra[am.targetColId] = mappedVal;
                                        }
                                      }
                                    });
                                  }
                                  handleRowChange(rIdx, col.id, keyVal, extra);
                                }}
                              />
                            ) : isCalculated ? (
                              <div
                                tabIndex={-1}
                                dir="ltr"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-bold text-left select-none"
                              >
                                {((readOnly && row[col.id] !== undefined && row[col.id] !== null && row[col.id] !== '')
                                  ? parseNumberSafe(row[col.id])
                                  : computeCellValue(col, row, columns)
                                ).toLocaleString('fa-IR', { maximumFractionDigits: 4 })}
                              </div>
                            ) : !isEditable ? (
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={row[col.id] ?? ''}
                                placeholder={col.label}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 text-xs cursor-default select-none font-medium"
                              />
                            ) : col.type === 'number' ? (
                              <input
                                id={cellId}
                                type="number"
                                step="any"
                                disabled={readOnly}
                                value={row[col.id] ?? ''}
                                onChange={(e) => handleRowChange(rIdx, col.id, e.target.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, col.id)}
                                placeholder={col.label}
                                dir="ltr"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs font-mono text-left"
                              />
                            ) : col.type === 'date' ? (
                              <PersianDatePicker
                                id={cellId}
                                value={row[col.id] ?? ''}
                                onChange={(val) => handleRowChange(rIdx, col.id, val)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, col.id)}
                                disabled={readOnly}
                                placeholder="تاریخ..."
                              />
                            ) : col.type === 'dropdown' && col.options ? (
                              <select
                                id={cellId}
                                disabled={readOnly}
                                value={row[col.id] ?? ''}
                                onChange={(e) => handleRowChange(rIdx, col.id, e.target.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, col.id)}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs"
                              >
                                <option value="">انتخاب...</option>
                                {col.options.map((opt, oIdx) => <option key={oIdx} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              <input
                                id={cellId}
                                type="text"
                                disabled={readOnly}
                                value={row[col.id] ?? ''}
                                onChange={(e) => handleRowChange(rIdx, col.id, e.target.value)}
                                onKeyDown={(e) => handleCellKeyDown(e, rIdx, col.id)}
                                placeholder={col.label}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-xs"
                              />
                            )}
                          </td>
                        );
                      })}
                      {!readOnly && (
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => handleDeleteRow(rIdx)}
                            className="p-1 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            title="حذف سطر (Alt+Delete)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              {Boolean(q.showSummaryRow) && rows.length > 0 && (
                <tfoot className="bg-slate-100/90 dark:bg-[#181926] font-bold border-t-2 border-slate-300 dark:border-slate-700">
                  <tr>
                    <td className="p-2 text-center text-slate-500 font-mono text-[11px]">جمع</td>
                    {columns.map(col => {
                      if (col.includeInTotal || col.type === 'calculated') {
                        const total = rows.reduce((acc, r) => {
                          const v = col.type === 'calculated'
                            ? ((readOnly && r[col.id] !== undefined && r[col.id] !== null && r[col.id] !== '')
                                ? parseNumberSafe(r[col.id])
                                : computeCellValue(col, r, columns))
                            : parseNumberSafe(r[col.id]);
                          return acc + v;
                        }, 0);
                        return (
                          <td key={col.id} dir="ltr" className="p-2 text-left font-mono font-bold text-blue-700 dark:text-sky-400">
                            {total.toLocaleString('fa-IR', { maximumFractionDigits: 4 })}
                          </td>
                        );
                      }
                      return <td key={col.id} className="p-2 text-slate-400 text-center">—</td>;
                    })}
                    {!readOnly && <td className="p-2"></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={() => handleAddRow(editableCols[0]?.id)}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-sky-950/50 hover:bg-blue-100 dark:hover:bg-sky-900/50 px-3.5 py-2 rounded-xl border border-blue-200 dark:border-sky-900/60 transition cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>افزودن سطر جدید</span>
            </button>
          )}

          {hasError && (
            <span className="text-xs text-rose-600 dark:text-rose-400 block pt-1 font-medium">
              {errors[q.id]}
            </span>
          )}
        </div>
      );
    }

    // ۴. سایر فیلدهای استاندارد
    return (
      <div
        key={q.id}
        className={`${widthClass} min-w-0 border rounded-xl sm:rounded-2xl p-2.5 sm:p-4 bg-white dark:bg-[#252736] space-y-2 transition shadow-2xs ${
          hasError
            ? 'border-rose-300 dark:border-rose-900 bg-rose-50/30'
            : 'border-slate-200 dark:border-slate-700/80'
        }`}
      >
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            {q.label} {q.required && <span className="text-rose-500 font-bold">*</span>}
          </label>
          {q.type === 'number' && q.maxDigits && (
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              {String(value).length} / {q.maxDigits} رقم
            </span>
          )}
        </div>

        {/* فیلد متنی کوتاه */}
        {q.type === 'text' && (
          <input
            type="text"
            disabled={readOnly}
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            placeholder="پاسخ خود را بنویسید..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {/* فیلد پاراگراف / متن بلند */}
        {q.type === 'paragraph' && (
          <textarea
            rows={3}
            disabled={readOnly}
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            placeholder="توضیحات و پاسخ کامل..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
          />
        )}

        {/* فیلد عددی با کنترل حداکثر ارقام */}
        {q.type === 'number' && (
          <div className="relative">
            <input
              type={q.maxDigits ? 'text' : 'number'}
              step={q.maxDigits ? undefined : 'any'}
              inputMode="decimal"
              disabled={readOnly}
              value={value}
              maxLength={q.maxDigits || undefined}
              onChange={(e) => handleNumberChange(q, e.target.value)}
              placeholder={`مقدار عددی${q.unit ? ` (${q.unit})` : ''}${q.maxDigits ? ` — حداکثر ${q.maxDigits} رقم` : ''}`}
              dir="ltr"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-right"
            />
            {q.unit && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#252736] px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                {q.unit}
              </span>
            )}
          </div>
        )}

        {/* تاریخ شمسی */}
        {q.type === 'date' && (
          <PersianDatePicker
            value={value}
            onChange={(val) => onChange(q.id, val)}
            placeholder="روز / ماه / سال شمسی..."
            disabled={readOnly}
          />
        )}

        {/* زمان / ساعت */}
        {q.type === 'time' && (
          <input
            type="time"
            disabled={readOnly}
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        )}

        {/* امتیازدهی ۵ ستاره */}
        {q.type === 'rating' && (
          <div className="flex items-center gap-2 py-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(q.id, star)}
                className={`p-2 rounded-xl transition cursor-pointer ${
                  (value || 0) >= star
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/40'
                    : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                }`}
              >
                <Star className="w-6 h-6 fill-current" />
              </button>
            ))}
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 mr-2">
              {value ? `${value} از ۵` : ''}
            </span>
          </div>
        )}

        {/* بارگذاری فایل (تکی یا چند فایل هم‌زمان با نگهداری پیوست‌های قبلی) */}
        {['file', 'upload', 'attachment'].includes(q.type) && (() => {
          // نرمال‌سازی فایل‌های موجود به صورت آرایه‌ای از متادیتای فایل‌ها
          const normalizeFiles = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.filter(Boolean);
            if (typeof val === 'string') {
              const trimmed = val.trim();
              if (trimmed.startsWith('[')) {
                try {
                  const parsed = JSON.parse(trimmed);
                  if (Array.isArray(parsed)) return parsed.filter(Boolean);
                } catch {}
              }
              if (trimmed) {
                const parts = trimmed.split(/[\/\\]/);
                const fname = parts[parts.length - 1];
                return [{
                  fileName: fname,
                  originalFileName: fname,
                  extension: fname.includes('.') ? fname.split('.').pop() : '',
                  downloadUrl: trimmed.startsWith('http') || trimmed.startsWith('/') ? trimmed : ''
                }];
              }
              return [];
            }
            if (typeof val === 'object') return [val];
            return [];
          };

          const currentFiles = normalizeFiles(value);
          const isUploading = !!uploadingFields[q.id];

          const handleFilesSelected = async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;

            setUploadingFields(prev => ({ ...prev, [q.id]: true }));
            const newlyUploaded = [];

            for (const file of files) {
              try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await api.post('/submissions/upload-attachment', fd);
                if (res.data) {
                  newlyUploaded.push(res.data);
                }
              } catch (err) {
                console.warn('Direct upload error, falling back to local file meta:', err);
                const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
                newlyUploaded.push({
                  fileName: file.name,
                  originalFileName: file.name,
                  size: file.size,
                  sizeFormatted: file.size < 1024
                    ? `${file.size} B`
                    : file.size < 1024 * 1024
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                  extension: ext,
                  downloadUrl: ''
                });
              }
            }

            // اضافه کردن فایل‌های جدید به لیست فایل‌های قبلی (عدم جایگزینی)
            const combined = [...currentFiles, ...newlyUploaded];
            onChange(q.id, combined);
            setUploadingFields(prev => ({ ...prev, [q.id]: false }));
            e.target.value = '';
          };

          const handleRemoveFile = (indexToRemove) => {
            const filtered = currentFiles.filter((_, idx) => idx !== indexToRemove);
            onChange(q.id, filtered.length > 0 ? filtered : null);
          };

          return (
            <div className="space-y-2.5">
              {/* دکمه انتخاب و بارگذاری فایل‌ها */}
              {!readOnly && (
                <label className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-dashed transition cursor-pointer text-xs ${
                  isUploading
                    ? 'border-blue-300 bg-blue-50/60 text-blue-600 dark:bg-blue-950/20 cursor-wait'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {isUploading ? (
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4 text-blue-500" />
                    )}
                    <span className="font-medium">
                      {isUploading
                        ? 'در حال بارگذاری فایل‌های انتخاب‌شده...'
                        : 'انتخاب و بارگذاری فایل‌های پیوست (یک یا چند فایل)...'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {currentFiles.length > 0 ? `${currentFiles.length} فایل ثبت‌شده` : 'پشتیبانی چندگانه'}
                  </span>
                  <input
                    type="file"
                    multiple
                    disabled={readOnly || isUploading}
                    className="hidden"
                    onChange={handleFilesSelected}
                  />
                </label>
              )}

              {/* لیست چیپ / کارت‌های مجزای فایل‌های پیوست‌شده */}
              {currentFiles.length > 0 ? (
                <div className="space-y-1.5">
                  {currentFiles.map((fileItem, fIdx) => {
                    const origName = typeof fileItem === 'object'
                      ? (fileItem.originalFileName || fileItem.fileName || fileItem.name || `پیوست ${fIdx + 1}`)
                      : String(fileItem);
                    const ext = (typeof fileItem === 'object' && fileItem.extension
                      ? fileItem.extension
                      : (origName.includes('.') ? origName.split('.').pop() : '')).toLowerCase();
                    const isImg = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext);
                    const isPdf = ext === 'pdf';
                    const isSheet = ['xls', 'xlsx', 'csv'].includes(ext);

                    return (
                      <div
                        key={fIdx}
                        className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                          {isImg ? (
                            <ImageIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                          ) : isPdf ? (
                            <FileText className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          ) : isSheet ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" title={origName}>
                            {origName}
                          </span>
                          {typeof fileItem === 'object' && fileItem.sizeFormatted && (
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              ({fileItem.sizeFormatted})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {typeof fileItem === 'object' && fileItem.downloadUrl && (
                            <a
                              href={fileItem.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-blue-600 hover:text-blue-800 dark:text-sky-400 rounded-lg hover:bg-blue-100/60 dark:hover:bg-slate-700 transition"
                              title="دانلود فایل"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(fIdx)}
                              className="p-1 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-100/60 dark:hover:bg-rose-950/40 transition cursor-pointer"
                              title="حذف این فایل"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : readOnly ? (
                <span className="text-xs text-slate-400 italic">فایلی پیوست نشده است</span>
              ) : null}
            </div>
          );
        })()}

        {/* چند گزینه‌ای (رادیویی) */}
        {q.type === 'radio' && (
          <div className="space-y-2 pr-1">
            {q.options?.map((opt, i) => (
              <label
                key={i}
                className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <input
                  type="radio"
                  disabled={readOnly}
                  name={`radio_${q.id}`}
                  checked={value === opt}
                  onChange={() => onChange(q.id, opt)}
                  className="text-blue-600 accent-blue-600 cursor-pointer"
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}

        {/* چند انتخابی (چک‌باکس) */}
        {q.type === 'checkbox' && (
          <div className="space-y-2 pr-1">
            {q.options?.map((opt, i) => {
              const arr = Array.isArray(value) ? value : [];
              const checked = arr.includes(opt);
              return (
                <label
                  key={i}
                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...arr, opt]
                        : arr.filter((x) => x !== opt);
                      onChange(q.id, next);
                    }}
                    className="rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        )}

        {/* منوی کشویی (Dropdown) */}
        {q.type === 'dropdown' && (
          <select
            disabled={readOnly}
            value={value}
            onChange={(e) => onChange(q.id, e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="">انتخاب کنید...</option>
            {q.options?.map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        )}

        {hasError && (
          <span className="text-xs text-rose-600 dark:text-rose-400 block pt-1 font-medium">
            {errors[q.id]}
          </span>
        )}
      </div>
    );
  };

  // دسته‌بندی فیلدها: پشتیبانی از حالت دریافت آرایه sections یا تجمیع خودکار بر اساس بلوک‌های type === 'section'
  if (Array.isArray(sections) && sections.length > 0) {
    return (
      <div className="space-y-3 sm:space-y-6" data-dynamic-form-renderer={readOnly ? 'readonly' : 'editable'}>
        {sections.map((sec, secIdx) => {
          const isCollapsed = Boolean(collapsedSections[sec.sectionId || secIdx]);
          return (
            <div
              key={sec.sectionId || secIdx}
              className="rounded-2xl sm:rounded-3xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 md:p-6 shadow-2xs space-y-2.5 sm:space-y-4 transition-all"
            >
              <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-sm">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] sm:text-xs text-blue-100 font-bold block mb-0.5">
                      مرحله {secIdx + 1} از {sections.length}
                    </span>
                    <h4 className="font-bold text-sm sm:text-base text-white">
                      {sec.title}
                    </h4>
                    {sec.description && (
                      <p className="text-[11px] sm:text-xs text-blue-100/90 mt-0.5 sm:mt-1 leading-relaxed whitespace-pre-wrap">
                        {sec.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, [sec.sectionId || secIdx]: !prev[sec.sectionId || secIdx] }))}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs shrink-0 self-end sm:self-center"
                >
                  <span>{isCollapsed ? 'نمایش اقلام بخش' : 'بستن این بخش'}</span>
                  {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              </div>

              {!isCollapsed && (
                <div className="grid grid-cols-12 gap-2.5 sm:gap-4 pt-1">
                  {(sec.questions || []).map(q => renderField(q))}
                </div>
              )}
            </div>
          );
        })}
        {showValidationAlert && !readOnly && (
          <ValidationRulesAlert validation={validationResult} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 sm:space-y-4" onKeyDown={handleFormKeyDown} data-dynamic-form-renderer={readOnly ? 'readonly' : 'editable'}>
      {groupedStructure.map((group, gIdx) => {
        // فیلدهای خارج از سکشن (بالای فرم)
        if (!group.section) {
          return (
            <div key={`loose_${gIdx}`} className="grid grid-cols-12 gap-2.5 sm:gap-4">
              {group.fields.map(q => renderField(q))}
            </div>
          );
        }

        // محفظه واقعی کادر سکشن با حاشیه نقطه‌چین و پالت رسمی سازمانی
        const secQ = group.section;
        const isCollapsed = Boolean(collapsedSections[secQ.id]);

        return (
          <div
            key={secQ.id}
            className="rounded-2xl sm:rounded-3xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-slate-200 dark:border-slate-700 p-2.5 sm:p-4 md:p-6 shadow-2xs space-y-2.5 sm:space-y-4 transition-all"
          >
            <div className="bg-gradient-to-l from-blue-600 to-blue-700 text-white p-2.5 sm:p-4 rounded-xl sm:rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 shadow-sm">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 text-white flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-sm sm:text-base text-white">
                    {secQ.label}
                  </h4>
                  {secQ.description && (
                    <p className="text-[11px] sm:text-xs text-blue-100/90 mt-0.5 sm:mt-1 leading-relaxed whitespace-pre-wrap">
                      {secQ.description}
                    </p>
                  )}
                </div>
              </div>
              {secQ.collapsible !== false && (
                <button
                  type="button"
                  onClick={() => setCollapsedSections(prev => ({ ...prev, [secQ.id]: !prev[secQ.id] }))}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/20 px-3 py-1.5 rounded-xl transition cursor-pointer shadow-2xs shrink-0 self-end sm:self-center"
                >
                  <span>{isCollapsed ? 'نمایش اقلام بخش' : 'بستن این بخش'}</span>
                  {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {!isCollapsed && (
              <div className="grid grid-cols-12 gap-2.5 sm:gap-4 pt-1">
                {group.fields.length === 0 ? (
                  <div className="col-span-12 p-4 text-center text-xs text-slate-400">
                    فیلدی در این بخش قرار ندارد.
                  </div>
                ) : (
                  group.fields.map(q => renderField(q))
                )}
              </div>
            )}
          </div>
        );
      })}
      {showValidationAlert && !readOnly && (
        <ValidationRulesAlert validation={validationResult} />
      )}
    </div>
  );
}
