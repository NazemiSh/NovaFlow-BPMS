import React from 'react';
import { Database, Search, RefreshCw, Plus, Edit2, Check, X } from 'lucide-react';

export default function MasterDataRecordsModal({
  isOpen,
  onClose,
  selectedTable,
  tableRecords,
  recordsTotal,
  recordsPage,
  setRecordsPage,
  recordsPageSize,
  recordsSearch,
  setRecordsSearch,
  recordsLoading,
  fetchTableRecords,
  handleOpenAddRecord,
  handleOpenEditRecord,
  handleToggleRecordStatus,
  recordEditModalOpen,
  setRecordEditModalOpen,
  editingRecord,
  recordFormKey,
  setRecordFormKey,
  recordFormData,
  setRecordFormData,
  handleSaveRecord
}) {
  if (!isOpen || !selectedTable) return null;

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
        <div className="bg-white dark:bg-[#1e2030] w-full sm:w-[95vw] max-w-5xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in">
          {/* هدر مودال رکوردها */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#181926]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-sky-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    رکوردهای جدول «{selectedTable.title}»
                  </h3>
                  <span className="font-mono text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                    {selectedTable.code}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  کل رکوردهای موجود: {recordsTotal.toLocaleString('fa-IR')} مورد
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* نوار جستجو و دکمه افزودن */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#1e2030]">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={recordsSearch}
                onChange={(e) => {
                  setRecordsSearch(e.target.value);
                  fetchTableRecords(selectedTable.id, 1, e.target.value);
                }}
                placeholder="جستجو در تمام ستون‌ها..."
                className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => fetchTableRecords(selectedTable.id, recordsPage, recordsSearch)}
                className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                title="تازه‌سازی"
                aria-label="تازه‌سازی رکوردهای جدول"
              >
                <RefreshCw className={`w-4 h-4 ${recordsLoading ? 'animate-spin text-blue-600' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleOpenAddRecord}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت رکورد جدید</span>
              </button>
            </div>
          </div>

          {/* جدول نمایش رکوردها */}
          <div className="flex-1 overflow-hidden p-2.5 sm:p-4 flex flex-col min-h-0 min-w-0">
            <div className="w-full min-w-0 flex-1 overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-700/80 rounded-2xl">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#181926] text-slate-700 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-slate-700 shadow-xs">
                  <tr>
                    <th className="p-2.5 w-12 text-center">#</th>
                    <th className="p-2.5 w-32 font-bold font-mono text-blue-600 dark:text-sky-400">
                      {selectedTable.uniqueKeyColumn} (کلید)
                    </th>
                    {(selectedTable.columns || []).map(col => {
                      if (col.name === selectedTable.uniqueKeyColumn) return null;
                      return (
                        <th key={col.name} className="p-2.5 min-w-[120px] font-bold">
                          {col.title}
                        </th>
                      );
                    })}
                    <th className="p-2.5 w-20 text-center whitespace-nowrap">وضعیت</th>
                    <th className="p-2.5 w-24 text-center whitespace-nowrap">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tableRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={(selectedTable.columns?.length || 1) + 3}
                        className="p-8 text-center text-slate-400 text-xs"
                      >
                        {recordsLoading ? 'در حال واکشی رکوردها...' : 'هیچ رکوردی در این جدول ثبت نشده است.'}
                      </td>
                    </tr>
                  ) : (
                    tableRecords.map((rec, rIdx) => (
                      <tr
                        key={rec.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                          !rec.isActive ? 'opacity-50 bg-slate-50/30' : ''
                        }`}
                      >
                        <td className="p-2.5 text-center text-slate-400 font-mono">
                          {(recordsPage - 1) * recordsPageSize + rIdx + 1}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-blue-600 dark:text-sky-400">
                          {rec.uniqueKeyValue}
                        </td>
                        {(selectedTable.columns || []).map(col => {
                          if (col.name === selectedTable.uniqueKeyColumn) return null;
                          const val = rec.data ? rec.data[col.name] : null;
                          return (
                            <td key={col.name} className="p-2.5 text-slate-700 dark:text-slate-300">
                              {val !== null && val !== undefined ? String(val) : '—'}
                            </td>
                          );
                        })}
                        <td className="p-2.5 text-center">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              rec.isActive
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}
                          >
                            {rec.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditRecord(rec)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                              title="ویرایش رکورد"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleRecordStatus(rec)}
                              className={`p-1 rounded cursor-pointer ${rec.isActive ? 'text-rose-400 hover:text-rose-600' : 'text-emerald-500 hover:text-emerald-700'}`}
                              title={rec.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                            >
                              {rec.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
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

          {/* صفحه‌بندی */}
          {recordsTotal > recordsPageSize && (
            <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50 dark:bg-[#181926]">
              <span className="text-slate-400 font-mono">
                صفحه {recordsPage} از {Math.ceil(recordsTotal / recordsPageSize)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={recordsPage <= 1}
                  onClick={() => {
                    const nextP = recordsPage - 1;
                    setRecordsPage(nextP);
                    fetchTableRecords(selectedTable.id, nextP, recordsSearch);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 dark:disabled:text-slate-500 transition cursor-pointer"
                >
                  صفحه قبل
                </button>
                <button
                  type="button"
                  disabled={recordsPage >= Math.ceil(recordsTotal / recordsPageSize)}
                  onClick={() => {
                    const nextP = recordsPage + 1;
                    setRecordsPage(nextP);
                    fetchTableRecords(selectedTable.id, nextP, recordsSearch);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/60 disabled:text-slate-400 dark:disabled:text-slate-500 transition cursor-pointer"
                >
                  صفحه بعد
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* مودال افزودن / ویرایش سطر رکورد دستی */}
      {recordEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e2030] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#181926]">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                {editingRecord ? 'ویرایش رکورد' : 'ثبت رکورد جدید'}
              </h3>
              <button
                type="button"
                onClick={() => setRecordEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  کلید یکتا ({selectedTable.uniqueKeyColumn}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={recordFormKey}
                  onChange={(e) => setRecordFormKey(e.target.value)}
                  placeholder="مقدار یکتای کلید..."
                  className="w-full text-xs font-mono font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none"
                />
              </div>

              {(selectedTable.columns || []).map(col => {
                if (col.name === selectedTable.uniqueKeyColumn) return null;
                return (
                  <div key={col.name}>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                      {col.title} ({col.name})
                    </label>
                    <input
                      type={col.dataType === 'number' ? 'number' : 'text'}
                      value={recordFormData[col.name] ?? ''}
                      onChange={(e) => setRecordFormData({ ...recordFormData, [col.name]: e.target.value })}
                      placeholder={`مقدار ${col.title}...`}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none"
                    />
                  </div>
                );
              })}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecordEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-500 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  ذخیره رکورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
