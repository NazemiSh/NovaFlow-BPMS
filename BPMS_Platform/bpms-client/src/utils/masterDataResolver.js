import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { flattenFormQuestions } from './formulaEvaluator';

const masterDataCache = new Map();
let masterTablesCatalogCache = null;
let masterTablesCatalogPromise = null;

export const getMasterTablesCatalog = async (forceRefresh = false) => {
  if (!forceRefresh && Array.isArray(masterTablesCatalogCache)) {
    return masterTablesCatalogCache;
  }
  if (!masterTablesCatalogPromise || forceRefresh) {
    masterTablesCatalogPromise = api
      .get('/masterdata/tables')
      .then((res) => {
        masterTablesCatalogCache = Array.isArray(res.data) ? res.data : [];
        return masterTablesCatalogCache;
      })
      .catch(() => masterTablesCatalogCache || [])
      .finally(() => {
        masterTablesCatalogPromise = null;
      });
  }
  return masterTablesCatalogPromise;
};

export const findMatchingMasterTable = (tablesCatalog = [], tableId, tableCode) => {
  if (!Array.isArray(tablesCatalog) || tablesCatalog.length === 0) return null;
  const rawId = tableId !== undefined && tableId !== null ? String(tableId).trim() : '';
  if (/^\d+$/.test(rawId) && Number(rawId) > 0) {
    const byId = tablesCatalog.find((t) => String(t.id) === rawId);
    if (byId) return byId;
  }
  const key = String(tableCode || rawId || '').trim().toLowerCase();
  if (!key) return null;
  return (
    tablesCatalog.find(
      (t) =>
        String(t.code || '').trim().toLowerCase() === key ||
        String(t.title || '').trim().toLowerCase() === key
    ) || null
  );
};

export const fetchMasterTableRecords = async (resolvedId) => {
  const idStr = String(resolvedId || '').trim();
  if (!idStr) return { meta: null, records: [] };

  const cacheKey = `md_${idStr}`;
  const cached = masterDataCache.get(cacheKey);
  const clientVersion = cached ? cached.versionHash : '';

  try {
    const res = await api.get(`/masterdata/tables/${idStr}/records`, {
      params: { version: clientVersion }
    });

    if (res.data?.upToDate && cached) {
      return cached;
    }

    const entry = {
      versionHash: res.data?.versionHash || '',
      meta: {
        id: idStr,
        uniqueKeyColumn: res.data?.uniqueKeyColumn || '',
        columns: res.data?.columns || []
      },
      records: res.data?.records || []
    };
    masterDataCache.set(cacheKey, entry);
    return entry;
  } catch (err) {
    if (cached) return cached;
    return { meta: null, records: [] };
  }
};

const getCaseInsensitiveProp = (obj, propName) => {
  if (!obj || typeof obj !== 'object' || !propName) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, propName)) return obj[propName];
  const target = String(propName).trim().toLowerCase();
  const matchedKey = Object.keys(obj).find((k) => k.trim().toLowerCase() === target);
  return matchedKey ? obj[matchedKey] : undefined;
};

export const findMatchingMasterRecord = (records = [], rawValue, valueColumn = '') => {
  if (!Array.isArray(records) || records.length === 0) return null;
  if (rawValue === undefined || rawValue === null) return null;
  const strVal = String(rawValue).trim();
  if (!strVal) return null;
  const lowerVal = strVal.toLowerCase();

  return (
    records.find(
      (r) =>
        String(r.uniqueKeyValue ?? '').trim() === strVal ||
        String(r.id ?? '').trim() === strVal ||
        (valueColumn && String(getCaseInsensitiveProp(r.data, valueColumn) ?? '').trim() === strVal)
    ) ||
    records.find(
      (r) =>
        String(r.uniqueKeyValue ?? '').trim().toLowerCase() === lowerVal ||
        (valueColumn && String(getCaseInsensitiveProp(r.data, valueColumn) ?? '').trim().toLowerCase() === lowerVal)
    ) ||
    null
  );
};

export const formatMasterRecordDisplay = (record, fieldMeta = {}, tableMeta = null, rawValue = '') => {
  const fallback = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';
  if (!record) return fallback;

  const valueCol = fieldMeta.valueColumn || tableMeta?.uniqueKeyColumn || '';
  const rawKey =
    record.uniqueKeyValue !== undefined && record.uniqueKeyValue !== null && String(record.uniqueKeyValue).trim() !== ''
      ? String(record.uniqueKeyValue).trim()
      : valueCol
      ? String(getCaseInsensitiveProp(record.data, valueCol) ?? fallback).trim()
      : fallback;

  const labelCol = fieldMeta.labelColumn || fieldMeta.displayColumn || '';
  let labelVal = '';

  if (labelCol && record.data) {
    const candidate = getCaseInsensitiveProp(record.data, labelCol);
    if (candidate !== undefined && candidate !== null) {
      labelVal = String(candidate).trim();
    }
  }

  if (!labelVal && record.data) {
    const otherKey = Object.keys(record.data).find((k) => {
      const lower = k.trim().toLowerCase();
      if (lower === 'id') return false;
      const v = record.data[k];
      return v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== rawKey;
    });
    if (otherKey) {
      labelVal = String(record.data[otherKey]).trim();
    }
  }

  if (!labelVal || labelVal === rawKey) {
    return rawKey || fallback;
  }

  const mode = fieldMeta.displayMode || null;
  const uniqueColLower = String(valueCol || '').trim().toLowerCase();
  const labelColLower = String(labelCol || '').trim().toLowerCase();

  // برای ستون‌هایی که کلید یکتا کد عددی است و displayColumn نام متنی متفاوتی دارد (مانند Unitname -> unitname با کلید unitref)
  if (mode === 'labelOnly' || (mode === 'keyOnly' && labelColLower && labelColLower !== uniqueColLower)) {
    return labelVal;
  }

  return `${labelVal} (${rawKey})`;
};

export const collectMasterTableRefsFromQuestions = (questionsOrSections = []) => {
  const flat = flattenFormQuestions(questionsOrSections);
  const refs = [];
  const seen = new Set();

  const addRef = (tableId, tableCode) => {
    const idStr = tableId !== undefined && tableId !== null ? String(tableId).trim() : '';
    const codeStr = tableCode ? String(tableCode).trim() : '';
    if (!idStr && !codeStr) return;
    const key = `${idStr}::${codeStr.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ tableId: idStr, tableCode: codeStr });
  };

  flat.forEach((q) => {
    if (!q || typeof q !== 'object') return;
    if (q.type === 'master_lookup') {
      addRef(q.masterTableId, q.masterTableCode);
    }
    if ((q.type === 'table' || q.type === 'repeater_grid' || q.type === 'repeating_table') && Array.isArray(q.columns)) {
      q.columns.forEach((col) => {
        if (col && col.type === 'master_lookup') {
          addRef(col.masterTableId, col.masterTableCode);
        }
      });
    }
  });

  return refs;
};

export const preloadMasterDataForQuestions = async (questionsOrSections = []) => {
  const refs = collectMasterTableRefsFromQuestions(questionsOrSections);
  if (refs.length === 0) {
    return { tablesCatalog: [], byId: new Map(), byCode: new Map() };
  }

  const tablesCatalog = await getMasterTablesCatalog();
  const byId = new Map();
  const byCode = new Map();
  const resolvedIds = new Set();
  const refToId = [];

  refs.forEach((ref) => {
    const matched = findMatchingMasterTable(tablesCatalog, ref.tableId, ref.tableCode);
    const resolvedId = matched ? String(matched.id) : (/^\d+$/.test(ref.tableId) && Number(ref.tableId) > 0 ? ref.tableId : '');
    if (resolvedId) {
      resolvedIds.add(resolvedId);
      refToId.push({ ref, resolvedId, tableMeta: matched });
    }
  });

  const fetchedEntries = await Promise.all(
    Array.from(resolvedIds).map(async (id) => {
      const entry = await fetchMasterTableRecords(id);
      return [id, entry];
    })
  );

  const entryById = new Map(fetchedEntries);
  refToId.forEach(({ ref, resolvedId, tableMeta }) => {
    const dataEntry = entryById.get(resolvedId);
    if (!dataEntry) return;
    const bundle = {
      tableMeta: tableMeta || dataEntry.meta,
      records: dataEntry.records || []
    };
    byId.set(resolvedId, bundle);
    if (ref.tableCode) byCode.set(ref.tableCode.toLowerCase(), bundle);
    if (tableMeta?.code) byCode.set(String(tableMeta.code).trim().toLowerCase(), bundle);
    if (tableMeta?.title) byCode.set(String(tableMeta.title).trim().toLowerCase(), bundle);
  });

  return { tablesCatalog, byId, byCode };
};

export const resolveMasterValueFromStore = (store, fieldMeta = {}, rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return '';
  if (typeof rawValue === 'object') {
    const objVal =
      rawValue.displayLabel ||
      rawValue.label ||
      rawValue.title ||
      rawValue.originalName ||
      rawValue.name ||
      rawValue.value;
    return objVal !== undefined && objVal !== null ? String(objVal) : '';
  }

  const strVal = String(rawValue).trim();
  if (!strVal) return '';
  if (!store || (!store.byId?.size && !store.byCode?.size)) return strVal;

  const idKey = fieldMeta.masterTableId !== undefined && fieldMeta.masterTableId !== null ? String(fieldMeta.masterTableId).trim() : '';
  const codeKey = fieldMeta.masterTableCode ? String(fieldMeta.masterTableCode).trim().toLowerCase() : '';

  const bundle = (idKey && store.byId?.get(idKey)) || (codeKey && store.byCode?.get(codeKey)) || null;
  if (!bundle || !Array.isArray(bundle.records) || bundle.records.length === 0) {
    return strVal;
  }

  const rec = findMatchingMasterRecord(bundle.records, strVal, fieldMeta.valueColumn);
  if (!rec) return strVal;

  return formatMasterRecordDisplay(rec, fieldMeta, bundle.tableMeta, strVal);
};

export const useMasterDataResolver = (questionsOrSections = []) => {
  const [store, setStore] = useState({ tablesCatalog: [], byId: new Map(), byCode: new Map() });
  const refsSignature = useMemo(() => {
    return collectMasterTableRefsFromQuestions(questionsOrSections)
      .map((r) => `${r.tableId}:${r.tableCode}`)
      .join('|');
  }, [questionsOrSections]);

  useEffect(() => {
    if (!refsSignature) {
      setStore({ tablesCatalog: [], byId: new Map(), byCode: new Map() });
      return;
    }
    let mounted = true;
    preloadMasterDataForQuestions(questionsOrSections)
      .then((loaded) => {
        if (mounted) setStore(loaded);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [refsSignature]);

  const resolveMasterValue = useMemo(() => {
    return (fieldMeta, rawValue) => resolveMasterValueFromStore(store, fieldMeta, rawValue);
  }, [store]);

  return { masterDataStore: store, resolveMasterValue };
};
