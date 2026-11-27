import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import ReactDOM from 'react-dom';
import { Search, ChevronDown, Check, X, Database, Loader2 } from 'lucide-react';
import {
  getMasterTablesCatalog,
  findMatchingMasterTable,
  fetchMasterTableRecords
} from '../utils/masterDataResolver';

export default function MasterLookupInput({
  id = null,
  tableId,
  tableCode = '',
  value = '',
  onChange = () => {},
  displayColumn = '',
  displayMode = null, // 'keyOnly' | 'combined' | null
  hasAutoFill = false,
  filterCondition = '',
  cascadingFilter = null, // { targetColumn, value, sourceLabel }
  disabled = false,
  placeholder = 'جستجو و انتخاب از مرجع...',
  className = '',
  autoFocus = false,
  tabIndex = undefined,
  onNextField = null,
  onPrevField = null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tableMeta, setTableMeta] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [missingTableMsg, setMissingTableMsg] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 480, openUp: false });

  const lookupInstanceId = useId();
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // پشتیبانی از درج مقدار بارکد اسکن‌شده در جستجوی Lookup فعال
  useEffect(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl) return undefined;
    const handleFillLookup = (ev) => {
      if (disabled) return;
      const incoming = ev?.detail?.value;
      if (incoming === undefined || incoming === null) return;
      setIsOpen(true);
      setSearchTerm(String(incoming));
      setHighlightIdx(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
    };
    triggerEl.addEventListener('bpms-fill-lookup', handleFillLookup);
    return () => triggerEl.removeEventListener('bpms-fill-lookup', handleFillLookup);
  }, [disabled]);

  // Fetch or load from cache (with automatic resolution of masterTableCode if numeric tableId is absent)
  useEffect(() => {
    const rawId = tableId !== undefined && tableId !== null ? String(tableId).trim() : '';
    const rawCode = tableCode ? String(tableCode).trim() : '';
    if (!rawId && !rawCode) return;

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setMissingTableMsg('');
      try {
        let resolvedId = /^\d+$/.test(rawId) && Number(rawId) > 0 ? rawId : '';

        if (!resolvedId) {
          const tables = await getMasterTablesCatalog();
          const matched = findMatchingMasterTable(tables, rawId, rawCode);
          if (matched) {
            resolvedId = String(matched.id);
          } else {
            if (isMounted) {
              setRecords([]);
              setTableMeta(null);
              setMissingTableMsg(`جدول مرجع «${rawCode || rawId}» هنوز در بانک داده‌های مرجع تعریف نشده است.`);
            }
            return;
          }
        }

        const entry = await fetchMasterTableRecords(resolvedId);
        if (isMounted && entry?.meta) {
          setTableMeta(entry.meta);
          setRecords(entry.records || []);
        }
      } catch (err) {
        console.error('Error fetching master data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => { isMounted = false; };
  }, [tableId, tableCode]);

  // Click outside listener (covering both trigger container and portal dropdown)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate portal dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 340; // Max expected height for max-h-72 + header
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    const viewportMaxW = Math.max(220, window.innerWidth - 32);
    const parentDialog = containerRef.current.closest(
      '#runner-modal-container > div, [role="dialog"] > div, [role="dialog"]'
    );
    const parentRect = parentDialog ? parentDialog.getBoundingClientRect() : null;
    const containerBoundMaxW = parentRect ? Math.max(220, parentRect.width - 16) : viewportMaxW;
    const hardMaxW = Math.min(viewportMaxW, containerBoundMaxW);

    let width;
    if (window.innerWidth < 640) {
      // On mobile: fit cleanly inside parent modal/card and viewport (max calc(100vw - 2rem))
      width = Math.min(hardMaxW, Math.max(rect.width, Math.min(hardMaxW, 340)));
    } else {
      // Desktop: comfortable 440px-620px width clamped to viewport/container
      width = Math.max(440, Math.min(620, Math.max(rect.width * 1.4, 460)));
      width = Math.min(width, hardMaxW);
    }

    // In RTL, align right edge of dropdown with right edge of input trigger, clamped to parent/viewport bounds
    const minLeftBound = parentRect ? Math.max(16, parentRect.left + 8) : 16;
    const maxRightBound = parentRect ? Math.min(window.innerWidth - 16, parentRect.right - 8) : (window.innerWidth - 16);

    let left = rect.right - width;
    if (left < minLeftBound) left = minLeftBound;
    if (left + width > maxRightBound) {
      left = Math.max(minLeftBound, maxRightBound - width);
    }

    const top = openUp ? Math.max(10, rect.top - dropdownHeight - 6) : (rect.bottom + 6);
    setDropdownPos({ top, left, width, openUp });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 20);

      window.addEventListener('resize', updateDropdownPosition);
      window.addEventListener('scroll', updateDropdownPosition, true);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateDropdownPosition);
        window.removeEventListener('scroll', updateDropdownPosition, true);
      };
    }
  }, [isOpen, updateDropdownPosition]);

  const hasCascadingFilter = Boolean(cascadingFilter && cascadingFilter.targetColumn);
  const cascadingSourceEmpty = hasCascadingFilter && (
    cascadingFilter.value === undefined ||
    cascadingFilter.value === null ||
    String(cascadingFilter.value).trim() === ''
  );

  // اعمال فیلتر آبشاری هم‌ردیف پیش از جستجوی متنی و برش ۵۰ تایی
  const baseRecords = useMemo(() => {
    if (!hasCascadingFilter) return records;
    if (cascadingSourceEmpty) return [];

    const normalizedFilterVal = String(cascadingFilter.value).trim().toLowerCase();
    const targetCol = String(cascadingFilter.targetColumn).trim();
    const targetColLower = targetCol.toLowerCase();

    return records.filter(r => {
      if (!r.data) return false;
      let recVal = r.data[targetCol];
      if (recVal === undefined) {
        const matchedKey = Object.keys(r.data).find(k => k.trim().toLowerCase() === targetColLower);
        if (matchedKey) recVal = r.data[matchedKey];
      }
      if (recVal === undefined || recVal === null) return false;
      return String(recVal).trim().toLowerCase() === normalizedFilterVal;
    });
  }, [records, hasCascadingFilter, cascadingSourceEmpty, cascadingFilter]);

  // Filter records based on searchTerm
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return baseRecords.slice(0, 50);

    const term = searchTerm.trim().toLowerCase();
    return baseRecords.filter(r => {
      if (r.uniqueKeyValue?.toLowerCase().includes(term)) return true;
      if (r.data) {
        for (const val of Object.values(r.data)) {
          if (val !== null && val !== undefined && String(val).toLowerCase().includes(term)) {
            return true;
          }
        }
      }
      return false;
    }).slice(0, 50);
  }, [baseRecords, searchTerm]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [filteredRecords.length, isOpen]);

  // Find currently selected record display text
  const selectedRecord = useMemo(() => {
    if (value === undefined || value === null || value === '') return null;
    const strVal = String(value).trim();
    const pool = hasCascadingFilter ? baseRecords : records;
    return pool.find(r =>
      String(r.uniqueKeyValue ?? '').trim() === strVal ||
      String(r.id ?? '').trim() === strVal
    ) || pool.find(r =>
      r.data && Object.values(r.data).some(v => v !== null && v !== undefined && String(v).trim() === strVal)
    );
  }, [records, baseRecords, hasCascadingFilter, value]);

  // Mode: 'keyOnly' (only key/displayColumn, no combined title) vs 'combined' (code - name)
  const effectiveDisplayMode = displayMode || (hasAutoFill ? 'keyOnly' : 'combined');

  const displayValue = useMemo(() => {
    const rawVal = (value !== undefined && value !== null) ? String(value).trim() : '';
    if (!rawVal) return '';

    if (!selectedRecord) {
      return rawVal;
    }

    if (effectiveDisplayMode === 'keyOnly') {
      if (displayColumn && selectedRecord.data && selectedRecord.data[displayColumn] !== undefined && selectedRecord.data[displayColumn] !== null && String(selectedRecord.data[displayColumn]).trim()) {
        return String(selectedRecord.data[displayColumn]);
      }
      return String(selectedRecord.uniqueKeyValue ?? rawVal);
    }

    // combined mode
    let titleVal = '';
    if (displayColumn && selectedRecord.data && selectedRecord.data[displayColumn] !== undefined && selectedRecord.data[displayColumn] !== null) {
      titleVal = String(selectedRecord.data[displayColumn]).trim();
    } else if (selectedRecord.data) {
      const keys = Object.keys(selectedRecord.data);
      const otherKey = keys.find(k => k !== 'id' && k !== 'Id' && selectedRecord.data[k] && String(selectedRecord.data[k]).trim() !== String(selectedRecord.uniqueKeyValue).trim());
      if (otherKey) {
        titleVal = String(selectedRecord.data[otherKey]).trim();
      }
    }

    if (titleVal && titleVal !== String(selectedRecord.uniqueKeyValue).trim()) {
      return `${selectedRecord.uniqueKeyValue ?? rawVal} - ${titleVal}`;
    }

    return String(selectedRecord.uniqueKeyValue ?? rawVal);
  }, [selectedRecord, value, displayColumn, effectiveDisplayMode]);

  const handleSelect = (rec) => {
    if (!rec) return;
    const selectedKey = String(rec.uniqueKeyValue ?? rec.id ?? '');
    onChange(selectedKey, rec.data || {});
    setIsOpen(false);
    setSearchTerm('');

    // If a next field callback is provided, invoke it
    if (onNextField) {
      setTimeout(() => onNextField(), 50);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('', {});
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightIdx(prev => Math.min(prev + 1, filteredRecords.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightIdx(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredRecords.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(filteredRecords[highlightIdx] || filteredRecords[0]);
      } else if (onNextField) {
        e.preventDefault();
        onNextField();
      }
    } else if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (onPrevField) {
          e.preventDefault();
          onPrevField();
        }
      } else {
        if (isOpen && filteredRecords.length > 0) {
          e.preventDefault();
          handleSelect(filteredRecords[highlightIdx] || filteredRecords[0]);
        } else if (onNextField) {
          e.preventDefault();
          onNextField();
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightIdx];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIdx, isOpen]);

  const columns = tableMeta?.columns || [];

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {/* Input / Trigger Box */}
      <div
        ref={triggerRef}
        id={id}
        data-lookup-trigger="true"
        data-lookup-instance={lookupInstanceId}
        tabIndex={disabled ? -1 : (tabIndex ?? 0)}
        onFocus={() => {
          if (!disabled && !isOpen) {
            setIsOpen(true);
          }
        }}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition cursor-pointer select-none outline-none ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-700'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/10 bg-white dark:bg-[#1e2030]'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1e2030] hover:border-slate-300 focus:border-blue-500'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Database className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          {isOpen ? (
            <input
              ref={inputRef}
              type="text"
              data-master-lookup-search="true"
              data-lookup-for={lookupInstanceId}
              autoFocus
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightIdx(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={displayValue || "تایپ کد یا نام جهت جستجو..."}
              className="w-full bg-transparent border-0 outline-none p-0 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />
          ) : (
            <span className={`truncate ${displayValue ? 'text-slate-800 dark:text-slate-100 font-medium' : 'text-slate-400'}`}>
              {displayValue || placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 mr-1">
          {loading && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
          {displayValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-rose-500 rounded-full"
              title="پاک کردن"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Multi-column Dropdown Popover rendered via React Portal to prevent table overflow clipping */}
      {isOpen && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${dropdownPos.top}px`,
            left: `${dropdownPos.left}px`,
            width: `${dropdownPos.width}px`,
            maxWidth: 'calc(100vw - 2rem)',
            zIndex: 99999
          }}
          className="w-full max-w-[calc(100vw-2rem)] bg-white dark:bg-[#1e2030] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 dir-rtl text-right"
        >
          {/* Header */}
          <div className="p-2.5 bg-slate-50 dark:bg-[#181926] border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="font-bold flex items-center gap-1.5 text-blue-600 dark:text-sky-400 truncate">
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">نتایج جستجو ({filteredRecords.length} مورد)</span>
            </span>
            <span className="hidden sm:inline text-[10px] text-slate-400 font-mono shrink-0">
              ↑↓ پیمایش | Enter انتخاب
            </span>
          </div>

          {/* Records List / Table (Max height 72 = ~288px, displays ~8 readable rows) */}
          <div ref={listRef} className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredRecords.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                {missingTableMsg
                  ? missingTableMsg
                  : loading
                  ? 'در حال دریافت داده‌ها...'
                  : cascadingSourceEmpty
                  ? `ابتدا مقدار «${cascadingFilter?.sourceLabel || 'ستون مبدا'}» را در این ردیف انتخاب کنید.`
                  : 'موردی یافت نشد.'}
              </div>
            ) : (
              filteredRecords.map((rec, idx) => {
                const isSelected = String(rec.uniqueKeyValue) === String(value);
                const isHighlighted = idx === highlightIdx;

                return (
                  <div
                    key={rec.id || idx}
                    onClick={() => handleSelect(rec)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition ${
                      isHighlighted
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100'
                        : isSelected
                        ? 'bg-blue-50/40 text-blue-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-600 dark:text-sky-400 bg-blue-100/60 dark:bg-sky-950 px-2 py-0.5 rounded text-[11px] shrink-0">
                          {rec.uniqueKeyValue}
                        </span>
                        {columns.slice(0, 2).map(c => {
                          const cVal = rec.data ? rec.data[c.name] : null;
                          if (!cVal || String(cVal) === String(rec.uniqueKeyValue)) return null;
                          return (
                            <span key={c.name} className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[200px]">
                              {String(cVal)}
                            </span>
                          );
                        })}
                      </div>

                      {/* نمایش ستون‌های فرعی دیگر */}
                      {columns.length > 2 && rec.data && (
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 mt-1 truncate">
                          {columns.slice(2, 6).map(c => {
                            const val = rec.data[c.name];
                            if (!val) return null;
                            return (
                              <span key={c.name}>
                                {c.title}: <b className="text-slate-600 dark:text-slate-400">{String(val)}</b>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
