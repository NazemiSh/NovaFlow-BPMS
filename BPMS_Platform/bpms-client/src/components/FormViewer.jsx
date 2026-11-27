import React, { useMemo } from 'react';
import { evaluateRowFormula } from '../utils/formulaEvaluator';
import { useMasterDataResolver } from '../utils/masterDataResolver';

const INTERNAL_ROW_KEYS = new Set(['id', '_rowid', 'rowid', '__rowid', 'key', '_key']);

const isAttachmentObject = (item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  return Boolean(item.originalName || item.originalFileName || item.fileName || item.storedPath || item.url);
};

const formatValueSafe = (val) => {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'object') {
    const label = val.originalName || val.originalFileName || val.name || val.fileName || val.label || val.title || val.value;
    if (label !== undefined && label !== null && label !== '') return String(label);
    try {
      return JSON.stringify(val);
    } catch {
      return '—';
    }
  }
  return String(val);
};

const getTableColumnsForRows = (qMeta, rows) => {
  if (Array.isArray(qMeta?.columns) && qMeta.columns.length > 0) {
    return qMeta.columns.filter((c) => c && !INTERNAL_ROW_KEYS.has(String(c.id || '').trim().toLowerCase()));
  }
  const seen = new Set();
  const cols = [];
  rows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    Object.keys(row).forEach((k) => {
      const lower = k.trim().toLowerCase();
      if (INTERNAL_ROW_KEYS.has(lower) || seen.has(k)) return;
      seen.add(k);
      cols.push({ id: k, label: k });
    });
  });
  return cols;
};

const getCellDisplayValue = (row, col, allCols, resolveMasterValue = null) => {
  if (!row || typeof row !== 'object') return '—';
  let raw = row[col.id];
  if ((raw === undefined || raw === null || raw === '') && col.type === 'calculated' && col.formula) {
    raw = evaluateRowFormula(col.formula, row, allCols);
  }
  if (col?.type === 'master_lookup' && resolveMasterValue) {
    const resolved = resolveMasterValue(col, raw);
    return resolved !== '' ? resolved : '—';
  }
  const formatted = formatValueSafe(raw);
  return formatted !== '' ? formatted : '—';
};

export default function FormViewer({ formDataJson, formsList, formTitle, formSchemaJson }) {
  let parsed = {};
  try {
    parsed = typeof formDataJson === 'string' ? JSON.parse(formDataJson) : (formDataJson || {});
  } catch (e) {
    parsed = { 'اطلاعات': String(formDataJson) };
  }

  const { labelMap, questionMap, formQuestionsList } = useMemo(() => {
    const labels = {};
    const qMap = {};
    const qList = [];

    const collectSchemaMetadata = (schemaObj) => {
      if (!schemaObj || typeof schemaObj !== 'object') return;
      (schemaObj.sections || []).forEach((sec) => {
        (sec.questions || []).forEach((q) => {
          if (q?.id) {
            if (q.label) labels[q.id] = q.label;
            qMap[q.id] = q;
            qList.push(q);
          }
        });
      });
    };

    // ۱. اولویت اول: استخراج برچسب و ساختار فیلدها از formSchemaJson خود آیتم
    if (formSchemaJson) {
      try {
        const s = typeof formSchemaJson === 'string' ? JSON.parse(formSchemaJson) : formSchemaJson;
        collectSchemaMetadata(s);
      } catch (err) {}
    }

    // ۲. اولویت دوم: در صورت نبودن، استخراج از کاتالوگ formsList
    if (qList.length === 0 && Array.isArray(formsList)) {
      const matchedForm = formsList.find(
        (f) => f.title === formTitle || f.formID === formTitle || String(f.id) === String(formTitle)
      );
      if (matchedForm?.schemaJson) {
        try {
          collectSchemaMetadata(JSON.parse(matchedForm.schemaJson));
        } catch (err) {}
      }
    }

    return { labelMap: labels, questionMap: qMap, formQuestionsList: qList };
  }, [formSchemaJson, formsList, formTitle]);

  const { resolveMasterValue } = useMasterDataResolver(formQuestionsList);

  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    return <div className="text-xs text-slate-400 p-2">محتوایی ثبت نشده است.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4 bg-slate-50/80 dark:bg-[#181926] p-2 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 min-w-0">
      {entries.map(([key, rawVal]) => {
        const label = labelMap[key] || key;
        const qMeta = questionMap[key];
        const isTableField = ['table', 'repeater_grid', 'repeating_table'].includes(qMeta?.type);

        let val = rawVal;
        if (isTableField && typeof rawVal === 'string') {
          try {
            const maybeArr = JSON.parse(rawVal);
            if (Array.isArray(maybeArr)) val = maybeArr;
          } catch {}
        }

        const isObjectTableArray =
          Array.isArray(val) && val.some((it) => it && typeof it === 'object' && !isAttachmentObject(it));

        if (isTableField || isObjectTableArray) {
          const rows = Array.isArray(val) ? val.filter((r) => r && typeof r === 'object') : [];
          if (rows.length === 0) {
            return (
              <div
                key={key}
                className="col-span-1 md:col-span-2 min-w-0 bg-white dark:bg-[#252736] p-2.5 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs flex items-center justify-between gap-2"
              >
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">موردی ثبت نشده</span>
              </div>
            );
          }

          const cols = getTableColumnsForRows(qMeta, rows);
          return (
            <div
              key={key}
              className="col-span-1 md:col-span-2 min-w-0 bg-white dark:bg-[#252736] p-2 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-2xs space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 min-w-0">{label}</span>
                <span className="text-[11px] font-mono text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 border border-blue-200/60 dark:border-blue-500/30 px-2 py-0.5 rounded font-bold whitespace-nowrap shrink-0">
                  {rows.length.toLocaleString('fa-IR')} سطر ثبت‌شده
                </span>
              </div>
              <div className="w-full overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2 w-8 text-center whitespace-nowrap">#</th>
                      {cols.map((c) => (
                        <th key={c.id} className="p-2 whitespace-nowrap">
                          {c.label || c.id}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                    {rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-2 text-center text-slate-400 font-mono whitespace-nowrap">
                          {(rIdx + 1).toLocaleString('fa-IR')}
                        </td>
                        {cols.map((c) => (
                          <td key={c.id} className="p-2 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {getCellDisplayValue(row, c, cols, resolveMasterValue)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {qMeta?.showSummaryRow && (
                    <tfoot className="bg-slate-100 dark:bg-[#181926] font-bold border-t border-slate-300 dark:border-slate-700">
                      <tr>
                        <td className="p-2 text-center text-slate-500 dark:text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          جمع
                        </td>
                        {cols.map((c) => {
                          if (c.includeInTotal || c.type === 'calculated') {
                            const total = rows.reduce((acc, r) => {
                              let cellVal = r[c.id];
                              if (
                                (cellVal === undefined || cellVal === null || cellVal === '') &&
                                c.type === 'calculated' &&
                                c.formula
                              ) {
                                cellVal = evaluateRowFormula(c.formula, r, cols);
                              }
                              return acc + (parseFloat(cellVal) || 0);
                            }, 0);
                            return (
                              <td
                                key={c.id}
                                className="p-2 text-left font-mono font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap"
                                dir="ltr"
                              >
                                {total.toLocaleString('fa-IR')}
                              </td>
                            );
                          }
                          return (
                            <td key={c.id} className="p-2 text-slate-400 text-center">
                              —
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        }

        const displayVal = Array.isArray(val)
          ? val.length === 0
            ? 'موردی ثبت نشده'
            : val.map((it) => formatValueSafe(it)).filter(Boolean).join('، ')
          : qMeta?.type === 'master_lookup'
            ? resolveMasterValue(qMeta, val) || '—'
            : formatValueSafe(val);

        return (
          <div key={key} className="bg-white dark:bg-[#252736] p-2.5 sm:p-3 rounded-xl border border-slate-100 dark:border-slate-700/80 shadow-2xs min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 block mb-1">{label}</span>
            <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{displayVal || '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

export { FormViewer };
