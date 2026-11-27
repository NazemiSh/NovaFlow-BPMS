import React, { useState, useEffect, useMemo } from 'react';
import api from '../api';
import {
  Database,
  Server,
  Table as TableIcon,
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Upload,
  Search,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Layers,
  FileSpreadsheet,
  ShieldCheck,
  Check,
  X,
  Play
} from 'lucide-react';
import { toPersianDateTime } from './PersianDatePicker';
import MasterDataConnectionsModal from './MasterDataConnectionsModal';
import MasterDataTableModal from './MasterDataTableModal';
import MasterDataRecordsModal from './MasterDataRecordsModal';
import MasterDataImportModal from './MasterDataImportModal';
import { useDialog } from './GlobalDialogProvider';

export default function MasterDataHubTab({ user }) {
  const { toast, confirm } = useDialog();
  const [activeSubTab, setActiveSubTab] = useState('tables'); // 'tables' | 'connections'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Data states
  const [connections, setConnections] = useState([]);
  const [tables, setTables] = useState([]);

  // Modals
  const [connModalOpen, setConnModalOpen] = useState(false);
  const [editingConn, setEditingConn] = useState(null);
  const [connForm, setConnForm] = useState({
    name: '',
    serverAddress: '',
    databaseName: '',
    authType: 'Sql',
    username: '',
    password: '',
    isActive: true
  });
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null);

  // Table Modal
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [savingTable, setSavingTable] = useState(false);
  const [tableForm, setTableForm] = useState({
    code: '',
    title: '',
    sourceType: 'Manual',
    connectionId: '',
    sqlQuery: '',
    uniqueKeyColumn: 'Id',
    columns: [{ name: 'Id', title: 'شناسه', dataType: 'string' }],
    syncScheduleType: 'None',
    syncScheduleValue: '',
    scheduleConfigJson: '',
    filterRulesJson: '',
    excludedKeysJson: '',
    isActive: true
  });

  // SQL Preview State
  const [sqlPreviewLoading, setSqlPreviewLoading] = useState(false);
  const [sqlPreviewResult, setSqlPreviewResult] = useState(null);
  const [sqlPreviewError, setSqlPreviewError] = useState('');

  // Records Manager Modal
  const [recordsModalOpen, setRecordsModalOpen] = useState(false);
  const [selectedTableForRecords, setSelectedTableForRecords] = useState(null);
  const [tableRecords, setTableRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsPageSize] = useState(25);
  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Add/Edit Record Modal
  const [recordEditModalOpen, setRecordEditModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordFormKey, setRecordFormKey] = useState('');
  const [recordFormData, setRecordFormData] = useState({});

  // Import Modal
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTable, setImportTable] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Table sync in progress
  const [syncingTableId, setSyncingTableId] = useState(null);

  // Search filter in tables
  const [tableFilterSearch, setTableFilterSearch] = useState('');

  useEffect(() => {
    fetchConnections();
    fetchTables();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await api.get('/masterdata/connections');
      setConnections(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTables = async () => {
    setLoading(true);
    try {
      const res = await api.get('/masterdata/tables');
      setTables(res.data || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'خطا در دریافت لیست جداول مرجع');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(''), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  };

  // Connections Handlers
  const handleOpenAddConn = () => {
    setEditingConn(null);
    setConnForm({
      name: '',
      serverAddress: '',
      databaseName: '',
      authType: 'Sql',
      username: '',
      password: '',
      isActive: true
    });
    setConnTestResult(null);
    setConnModalOpen(true);
  };

  const handleOpenEditConn = (conn) => {
    setEditingConn(conn);
    setConnForm({
      name: conn.name,
      serverAddress: conn.serverAddress,
      databaseName: conn.databaseName,
      authType: conn.authType || 'Sql',
      username: conn.username || '',
      password: '',
      isActive: conn.isActive
    });
    setConnTestResult(null);
    setConnModalOpen(true);
  };

  const handleTestConnection = async (connId = null) => {
    setConnTesting(true);
    setConnTestResult(null);
    try {
      const payload = connId
        ? { connectionId: connId }
        : {
            serverAddress: connForm.serverAddress,
            databaseName: connForm.databaseName,
            authType: connForm.authType || 'Sql',
            username: connForm.username,
            password: connForm.password
          };
      const res = await api.post('/masterdata/connections/test', payload);
      setConnTestResult(res.data);
      if (res.data.success) {
        showToast(res.data.message);
      } else {
        showToast(res.data.message, true);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'خطا در تست اتصال';
      setConnTestResult({ success: false, message: msg });
      showToast(msg, true);
    } finally {
      setConnTesting(false);
    }
  };

  const handleSaveConnection = async (e) => {
    e.preventDefault();
    const isWindows = connForm.authType === 'Windows';
    if (!connForm.name || !connForm.serverAddress || !connForm.databaseName || (!isWindows && !connForm.username)) {
      showToast('لطفاً تمامی فیلدهای الزامی را تکمیل نمایید.', true);
      return;
    }

    try {
      if (editingConn) {
        await api.put(`/masterdata/connections/${editingConn.id}`, connForm);
        showToast('اتصال با موفقیت ویرایش شد.');
      } else {
        await api.post('/masterdata/connections', connForm);
        showToast('اتصال جدید با موفقیت ثبت شد.');
      }
      setConnModalOpen(false);
      fetchConnections();
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در ذخیره اتصال', true);
    }
  };

  const handleDeleteConnection = async (conn) => {
    const confirmed = await confirm({
      title: 'حذف اتصال پایگاه‌داده',
      message: `آیا از حذف اتصال «${conn.name}» اطمینان دارید؟`,
      confirmText: 'تایید و حذف اتصال',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await api.delete(`/masterdata/connections/${conn.id}`);
      showToast('اتصال با موفقیت حذف گردید.');
      fetchConnections();
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در حذف اتصال', true);
    }
  };

  // Tables Handlers
  const handleOpenAddTable = () => {
    setEditingTable(null);
    setTableForm({
      code: '',
      title: '',
      sourceType: 'Manual',
      connectionId: connections.length > 0 ? String(connections[0].id) : '',
      sqlQuery: 'SELECT Id, Code, Name FROM MyTable',
      uniqueKeyColumn: 'Id',
      columns: [
        { name: 'Id', title: 'شناسه', dataType: 'string' },
        { name: 'Title', title: 'عنوان', dataType: 'string' }
      ],
      syncScheduleType: 'None',
      syncScheduleValue: '',
      scheduleConfigJson: '',
      filterRulesJson: '',
      excludedKeysJson: '',
      isActive: true
    });
    setSqlPreviewResult(null);
    setSqlPreviewError('');
    setTableModalOpen(true);
  };

  const handleOpenEditTable = (table) => {
    setEditingTable(table);
    setTableForm({
      code: table.code,
      title: table.title,
      sourceType: table.sourceType,
      connectionId: table.connectionId ? String(table.connectionId) : '',
      sqlQuery: table.sqlQuery || '',
      uniqueKeyColumn: table.uniqueKeyColumn || 'Id',
      columns: (table.columns && table.columns.length > 0)
        ? JSON.parse(JSON.stringify(table.columns))
        : [{ name: 'Id', title: 'شناسه', dataType: 'string' }],
      syncScheduleType: table.syncScheduleType || 'None',
      syncScheduleValue: table.syncScheduleValue || '',
      scheduleConfigJson: table.scheduleConfigJson || '',
      filterRulesJson: table.filterRulesJson || '',
      excludedKeysJson: table.excludedKeysJson || '',
      isActive: table.isActive
    });
    setSqlPreviewResult(null);
    setSqlPreviewError('');
    setTableModalOpen(true);
  };

  const handleAddColumn = () => {
    const colNum = tableForm.columns.length + 1;
    setTableForm({
      ...tableForm,
      columns: [
        ...tableForm.columns,
        { name: `Col_${colNum}`, title: `ستون ${colNum}`, dataType: 'string' }
      ]
    });
  };

  const handleRemoveColumn = (idx) => {
    if (tableForm.columns.length <= 1) {
      toast.warning('جدول باید حداقل یک ستون داشته باشد.');
      return;
    }
    const nextCols = tableForm.columns.filter((_, i) => i !== idx);
    let nextUnique = tableForm.uniqueKeyColumn;
    if (tableForm.columns[idx].name === nextUnique) {
      nextUnique = nextCols[0].name;
    }
    setTableForm({
      ...tableForm,
      columns: nextCols,
      uniqueKeyColumn: nextUnique
    });
  };

  const handleColumnChange = (idx, field, val) => {
    const nextCols = [...tableForm.columns];
    const oldName = nextCols[idx].name;
    nextCols[idx] = { ...nextCols[idx], [field]: val };

    let nextUnique = tableForm.uniqueKeyColumn;
    if (field === 'name' && tableForm.uniqueKeyColumn === oldName) {
      nextUnique = val;
    }

    setTableForm({
      ...tableForm,
      columns: nextCols,
      uniqueKeyColumn: nextUnique
    });
  };

  const handlePreviewSql = async () => {
    if (!tableForm.connectionId) {
      toast.warning('لطفاً ابتدا اتصال پایگاه‌داده را انتخاب نمایید.');
      return;
    }
    if (!tableForm.sqlQuery || !tableForm.sqlQuery.trim()) {
      toast.warning('متن کوئری SQL نمی‌تواند خالی باشد.');
      return;
    }

    setSqlPreviewLoading(true);
    setSqlPreviewError('');
    setSqlPreviewResult(null);

    try {
      const res = await api.post('/masterdata/tables/preview-sql', {
        connectionId: parseInt(tableForm.connectionId),
        sqlQuery: tableForm.sqlQuery
      });
      setSqlPreviewResult(res.data);

      if (res.data.columns && res.data.columns.length > 0) {
        const newCols = res.data.columns.map(c => ({
          name: c.name,
          title: c.title || c.name,
          dataType: c.dataType || 'string'
        }));
        let matchedUnique = newCols.find(c => c.name.toLowerCase() === 'id' || c.name.toLowerCase().includes('code'))?.name || newCols[0].name;

        setTableForm(prev => ({
          ...prev,
          columns: newCols,
          uniqueKeyColumn: matchedUnique
        }));
      }
    } catch (err) {
      setSqlPreviewError(err.response?.data?.message || 'خطا در اجرای آزمایشی کوئری');
    } finally {
      setSqlPreviewLoading(false);
    }
  };

  const handleSaveTable = async (e, excelImportOptions = null) => {
    e?.preventDefault();
    if (!tableForm.code || !tableForm.title) {
      toast.warning('کد و عنوان جدول الزامی هستند.');
      return;
    }

    const rawColumns = excelImportOptions?.columnsToSave && excelImportOptions.columnsToSave.length > 0
      ? excelImportOptions.columnsToSave
      : tableForm.columns;

    if (!rawColumns || rawColumns.length === 0) {
      toast.warning('حداقل یک ستون باید برای جدول تعریف شود.');
      return;
    }

    const cleanColumns = rawColumns.map((c) => ({
      name: String(c.name || '').trim(),
      title: String(c.title || c.name || '').trim(),
      dataType: c.dataType || 'string'
    }));

    const payload = {
      code: tableForm.code.trim().toUpperCase(),
      title: tableForm.title.trim(),
      sourceType: tableForm.sourceType,
      connectionId: tableForm.sourceType === 'SqlQuery' && tableForm.connectionId ? parseInt(tableForm.connectionId, 10) : null,
      sqlQuery: tableForm.sourceType === 'SqlQuery' ? tableForm.sqlQuery : null,
      uniqueKeyColumn: tableForm.uniqueKeyColumn,
      columns: cleanColumns,
      syncScheduleType: tableForm.syncScheduleType,
      syncScheduleValue: tableForm.syncScheduleValue,
      scheduleConfigJson: tableForm.scheduleConfigJson || null,
      filterRulesJson: tableForm.filterRulesJson || null,
      excludedKeysJson: tableForm.excludedKeysJson || null,
      isActive: tableForm.isActive
    };

    setSavingTable(true);
    try {
      let savedTable;
      if (editingTable) {
        const res = await api.put(`/masterdata/tables/${editingTable.id}`, payload);
        savedTable = res.data;
      } else {
        const res = await api.post('/masterdata/tables', payload);
        savedTable = res.data;
        // در صورت بروز خطا در مرحله ورود داده، ذخیره بعدی همین جدول را به‌روزرسانی کند
        setEditingTable(savedTable);
      }

      if (tableForm.sourceType === 'Excel' && excelImportOptions?.excelFile && savedTable?.id) {
        const columnMappings = rawColumns.map((c) => ({
          sourceHeader: c.sourceHeader || c.name,
          targetColumnName: String(c.name || '').trim()
        }));

        const importFormData = new FormData();
        importFormData.append('file', excelImportOptions.excelFile);
        if (excelImportOptions.sheetName) {
          importFormData.append('sheetName', excelImportOptions.sheetName);
        }
        importFormData.append('columnMappingsJson', JSON.stringify(columnMappings));

        const importRes = await api.post(`/masterdata/tables/${savedTable.id}/import`, importFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const count = importRes.data?.importedCount ?? importRes.data?.table?.recordCount ?? 0;
        const msg = editingTable
          ? `جدول مرجع «${payload.title}» به‌روزرسانی شد و ${count} رکورد از فایل وارد گردید.`
          : `جدول مرجع «${payload.title}» ایجاد شد و ${count} رکورد با موفقیت وارد گردید.`;
        toast.success(msg);
        showToast(msg);
      } else {
        const msg = editingTable ? 'جدول مرجع با موفقیت ویرایش شد.' : 'جدول مرجع جدید با موفقیت ایجاد گردید.';
        toast.success(msg);
        showToast(msg);
      }

      setTableModalOpen(false);
      fetchTables();
    } catch (err) {
      const errMsg = err.response?.data?.message || 'خطا در ذخیره جدول مرجع';
      toast.error(errMsg);
      showToast(errMsg, true);
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = async (table) => {
    const confirmed = await confirm({
      title: 'حذف کامل جدول مرجع',
      message: `آیا از حذف کامل جدول مرجع «${table.title}» (${table.code}) و تمامی رکوردهای آن اطمینان دارید؟`,
      confirmText: 'تایید و حذف جدول',
      variant: 'danger'
    });
    if (!confirmed) return;
    try {
      await api.delete(`/masterdata/tables/${table.id}`);
      showToast('جدول مرجع با موفقیت حذف گردید.');
      fetchTables();
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در حذف جدول', true);
    }
  };

  const handleSyncNow = async (table) => {
    setSyncingTableId(table.id);
    try {
      const res = await api.post(`/masterdata/tables/${table.id}/sync`);
      showToast(res.data.message || 'همگام‌سازی با موفقیت انجام شد.');
      fetchTables();
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در همگام‌سازی جدول', true);
      fetchTables();
    } finally {
      setSyncingTableId(null);
    }
  };

  // Records Manager Handlers
  const handleOpenRecords = async (table) => {
    setSelectedTableForRecords(table);
    setRecordsPage(1);
    setRecordsSearch('');
    setRecordsModalOpen(true);
    fetchTableRecords(table.id, 1, '');
  };

  const fetchTableRecords = async (tableId, page = 1, search = '') => {
    setRecordsLoading(true);
    try {
      const res = await api.get(`/masterdata/tables/${tableId}/records/manage`, {
        params: { page, pageSize: recordsPageSize, search }
      });
      setTableRecords(res.data.items || []);
      setRecordsTotal(res.data.total || 0);
      setRecordsPage(res.data.page || 1);
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در بارگذاری رکوردهای جدول', true);
    } finally {
      setRecordsLoading(false);
    }
  };

  const handleOpenAddRecord = () => {
    setEditingRecord(null);
    setRecordFormKey('');
    const initData = {};
    (selectedTableForRecords?.columns || []).forEach(c => {
      initData[c.name] = '';
    });
    setRecordFormData(initData);
    setRecordEditModalOpen(true);
  };

  const handleOpenEditRecord = (rec) => {
    setEditingRecord(rec);
    setRecordFormKey(rec.uniqueKeyValue);
    setRecordFormData({ ...(rec.data || {}) });
    setRecordEditModalOpen(true);
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    if (!recordFormKey.trim()) {
      toast.warning('مقدار کلید یکتا الزامی است.');
      return;
    }

    try {
      const payload = {
        uniqueKeyValue: recordFormKey.trim(),
        data: {
          ...recordFormData,
          [selectedTableForRecords.uniqueKeyColumn]: recordFormKey.trim()
        },
        isActive: true
      };

      if (editingRecord) {
        await api.put(`/masterdata/tables/${selectedTableForRecords.id}/records/${editingRecord.id}`, payload);
        showToast('رکورد با موفقیت ویرایش شد.');
      } else {
        await api.post(`/masterdata/tables/${selectedTableForRecords.id}/records`, payload);
        showToast('رکورد جدید با موفقیت اضافه شد.');
      }

      setRecordEditModalOpen(false);
      fetchTableRecords(selectedTableForRecords.id, recordsPage, recordsSearch);
      fetchTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'خطا در ذخیره رکورد');
    }
  };

  const handleToggleRecordStatus = async (rec) => {
    try {
      await api.delete(`/masterdata/tables/${selectedTableForRecords.id}/records/${rec.id}`);
      fetchTableRecords(selectedTableForRecords.id, recordsPage, recordsSearch);
      fetchTables();
    } catch (err) {
      showToast(err.response?.data?.message || 'خطا در تغییر وضعیت رکورد', true);
    }
  };

  // Import & Template Handlers
  const handleOpenImport = (table) => {
    setImportTable(table);
    setImportFile(null);
    setImportModalOpen(true);
  };

  const handleDownloadTemplate = (table) => {
    window.open(`/api/masterdata/tables/${table.id}/sample-template`, '_blank');
  };

  const handleSubmitImport = async (e, importOptions = null) => {
    e?.preventDefault();
    const targetFile = importOptions?.file || importFile;
    if (!targetFile) {
      toast.warning('لطفاً یک فایل اکسل (.xlsx / .xls) یا (.csv) انتخاب نمایید.');
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', targetFile);
      if (importOptions?.sheetName) {
        formData.append('sheetName', importOptions.sheetName);
      }
      if (Array.isArray(importOptions?.columnMappings) && importOptions.columnMappings.length > 0) {
        formData.append('columnMappingsJson', JSON.stringify(importOptions.columnMappings));
      }

      const res = await api.post(`/masterdata/tables/${importTable.id}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const msg = res.data?.message || 'داده‌ها با موفقیت ایمپورت شدند.';
      toast.success(msg);
      showToast(msg);
      setImportModalOpen(false);
      fetchTables();
    } catch (err) {
      const errMsg = err.response?.data?.message || 'خطا در بارگذاری فایل';
      toast.error(errMsg);
    } finally {
      setImporting(false);
    }
  };

  const filteredTables = useMemo(() => {
    if (!tableFilterSearch.trim()) return tables;
    const s = tableFilterSearch.trim().toLowerCase();
    return tables.filter(t =>
      t.code?.toLowerCase().includes(s) ||
      t.title?.toLowerCase().includes(s) ||
      t.sourceType?.toLowerCase().includes(s)
    );
  }, [tables, tableFilterSearch]);

  return (
    <div className="space-y-6">
      {/* هدر ماژول */}
      <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">بانک داده‌های مرجع (Master Data Hub)</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              مدیریت متمرکز داده‌های پایه، اتصال مستقیم به پایگاه‌داده‌های بیرونی (SQL Server)، اکسل و فرم‌های چندجدولی پویا
            </p>
          </div>
        </div>

        {/* دکمه‌های سوئیچ تب داخلی */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-[#181926] p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab('tables')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              activeSubTab === 'tables'
                ? 'bg-white dark:bg-[#252736] text-blue-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <TableIcon className="w-4 h-4 shrink-0" />
            <span>جداول مرجع</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full font-mono shrink-0">
              {tables.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('connections')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              activeSubTab === 'connections'
                ? 'bg-white dark:bg-[#252736] text-blue-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4 shrink-0" />
            <span>اتصالات پایگاه‌داده</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.2 rounded-full font-mono shrink-0">
              {connections.length}
            </span>
          </button>
        </div>
      </div>

      {/* پیام‌های وضعیت */}
      {successMsg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-4 rounded-2xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-4 rounded-2xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* تب ۱: مدیریت جداول مرجع */}
      {activeSubTab === 'tables' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={tableFilterSearch}
                onChange={(e) => setTableFilterSearch(e.target.value)}
                placeholder="جستجو بر اساس کد، عنوان جدول..."
                className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#181926] text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={fetchTables}
                disabled={loading}
                className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#252736] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="تازه‌سازی"
                aria-label="تازه‌سازی جداول مرجع"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleOpenAddTable}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف جدول مرجع جدید</span>
              </button>
            </div>
          </div>

          {/* لیست کارت‌های جداول */}
          {filteredTables.length === 0 ? (
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-slate-400">
                <TableIcon className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">هنوز جدول مرجعی تعریف نشده است.</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                می‌توانید جداول کالاها، مشتریان، مراکز هزینه یا پرسنل را به صورت دستی، اکسل یا از طریق اتصال مستقیم SQL Server ایجاد نمایید.
              </p>
              <button
                type="button"
                onClick={handleOpenAddTable}
                className="inline-flex items-center gap-2 text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>ایجاد اولین جدول مرجع</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredTables.map((table) => {
                const isSyncing = syncingTableId === table.id;
                return (
                  <div
                    key={table.id}
                    className="bg-white dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 hover:shadow-md transition flex flex-col justify-between min-w-0 overflow-hidden"
                  >
                    <div>
                      {/* هدر کارت */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-600 dark:text-sky-400 bg-blue-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-blue-100 dark:border-sky-900 truncate max-w-full">
                              {table.code}
                            </span>
                            {!table.isActive && (
                              <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded shrink-0">
                                غیرفعال
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mt-1.5 truncate" title={table.title}>
                            {table.title}
                          </h3>
                        </div>

                        {/* برچسب منبع داده */}
                        {table.sourceType === 'SqlQuery' ? (
                          <span className="text-[11px] bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded-lg font-bold shrink-0 flex items-center gap-1">
                            <Database className="w-3 h-3" />
                            <span>SQL Server</span>
                          </span>
                        ) : table.sourceType === 'Excel' ? (
                          <span className="text-[11px] bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-lg font-bold shrink-0 flex items-center gap-1">
                            <FileSpreadsheet className="w-3 h-3" />
                            <span>Excel / CSV</span>
                          </span>
                        ) : (
                          <span className="text-[11px] bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded-lg font-bold shrink-0 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>دستی</span>
                          </span>
                        )}
                      </div>

                      {/* اطلاعات آماری و وضعیت همگام‌سازی */}
                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span>تعداد رکوردهای فعال:</span>
                          <span className="font-bold font-mono text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {table.recordCount.toLocaleString('fa-IR')} رکورد
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                          <span>ستون کلید یکتا:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">{table.uniqueKeyColumn}</span>
                        </div>

                        {table.sourceType === 'SqlQuery' && (
                          <>
                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                              <span>اتصال مبدأ:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                                {table.connectionName || '—'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                              <span>زمان‌بندی همگام‌سازی:</span>
                              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                {table.syncScheduleType === 'IntervalMinutes'
                                  ? `هر ${table.syncScheduleValue} دقیقه`
                                  : table.syncScheduleType === 'DailyTime'
                                  ? `روزانه ساعت ${table.syncScheduleValue}`
                                  : 'غیرفعال (فقط دستی)'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                              <span>آخرین همگام‌سازی:</span>
                              <div className="flex items-center gap-1">
                                {table.lastSyncStatus === 'Success' && (
                                  <span className="text-emerald-600 font-bold flex items-center gap-0.5 text-[11px]">
                                    <Check className="w-3 h-3" /> موفق
                                  </span>
                                )}
                                {table.lastSyncStatus === 'Failed' && (
                                  <span
                                    className="text-rose-600 font-bold flex items-center gap-0.5 text-[11px] cursor-help"
                                    title={table.lastSyncError}
                                  >
                                    <AlertTriangle className="w-3 h-3" /> خطا
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400">
                                  {table.lastSyncAt ? toPersianDateTime(table.lastSyncAt) : 'هنوز اجرا نشده'}
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* دکمه‌های عملیات */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {table.sourceType === 'SqlQuery' && (
                          <button
                            type="button"
                            disabled={isSyncing}
                            onClick={() => handleSyncNow(table)}
                            className="flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 transition cursor-pointer"
                            title="همگام‌سازی مستقیم با دیتابیس خارجی"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                            <span>{isSyncing ? 'در حال دریافت...' : 'همگام‌سازی اکنون'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenRecords(table)}
                          className="flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-sky-300 bg-blue-50 dark:bg-sky-950/60 hover:bg-blue-100 dark:hover:bg-sky-900/60 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-sky-800 transition cursor-pointer"
                          title="مشاهده، جستجو و ویرایش رکوردهای این جدول"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>رکوردها</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenImport(table)}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 transition cursor-pointer"
                          title="ایمپورت اکسل / CSV"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>ایمپورت</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditTable(table)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                          title="ویرایش تنظیمات جدول"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteTable(table)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                          title="حذف جدول"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* تب ۲: اتصالات پایگاه‌داده (Data Connections) */}
      {activeSubTab === 'connections' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#1e2030] p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">اتصالات تعریف‌شده به پایگاه‌داده‌های خارجی (SQL Server)</h3>
              <p className="text-xs text-slate-400 mt-0.5">اتصال به سیستم‌های مالی، انبار، پرسنلی یا ERP جهت دریافت بدون واسطه اطلاعات پایه</p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddConn}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>تعریف اتصال جدید</span>
            </button>
          </div>

          {connections.length === 0 ? (
            <div className="bg-white dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl mx-auto flex items-center justify-center text-slate-400">
                <Server className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">هیچ اتصال پایگاه‌داده‌ای تعریف نشده است.</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                برای متصل کردن نوافلو به SQL Server نرم‌افزارهای سازمان، یک اتصال جدید با دسترسی فقط خواندنی (Read-Only) ایجاد فرمایید.
              </p>
              <button
                type="button"
                onClick={handleOpenAddConn}
                className="inline-flex items-center gap-2 text-xs font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-sky-400 px-4 py-2 rounded-xl border border-blue-200 dark:border-blue-900 hover:bg-blue-100 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>تعریف اولین اتصال</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="bg-white dark:bg-[#1e2030] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 flex items-center justify-center text-cyan-600 dark:text-cyan-300">
                        <Server className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">{conn.name}</h4>
                        <span className="text-[11px] font-mono text-slate-400">{conn.serverAddress}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        conn.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {conn.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>

                  <div className="bg-slate-50 dark:bg-[#181926] p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-500">
                      <span>نام پایگاه‌داده:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{conn.databaseName}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500">
                      <span>نوع احراز هویت:</span>
                      <span className={`font-bold text-[11px] px-2 py-0.5 rounded-md ${
                        conn.authType === 'Windows'
                          ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                      }`}>
                        {conn.authType === 'Windows' ? 'ویندوز / دامین (Active Directory)' : 'SQL Authentication'}
                      </span>
                    </div>
                    {conn.authType === 'Windows' ? (
                      <>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>هویت سرویس:</span>
                          <span className="text-cyan-600 dark:text-cyan-400 font-bold flex items-center gap-1 text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {conn.username ? `اکانت دامنه (${conn.username})` : 'هویت ویندوز سرور (IIS Pool)'}
                          </span>
                        </div>
                        {conn.username && (
                          <div className="flex items-center justify-between text-slate-500">
                            <span>رمز عبور:</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                              <ShieldCheck className="w-3.5 h-3.5" /> رمزنگاری‌شده AES
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>نام کاربری:</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300">{conn.username}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span>رمز عبور:</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                            <ShieldCheck className="w-3.5 h-3.5" /> رمزنگاری‌شده AES
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={connTesting}
                      onClick={() => handleTestConnection(conn.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-2 rounded-xl transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-blue-600" />
                      <span>تست اتصال</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditConn(conn)}
                      className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      title="ویرایش"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteConnection(conn)}
                      className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* مودال تعریف / ویرایش اتصال */}
      <MasterDataConnectionsModal
        isOpen={connModalOpen}
        onClose={() => setConnModalOpen(false)}
        editingConn={editingConn}
        connForm={connForm}
        setConnForm={setConnForm}
        handleSaveConnection={handleSaveConnection}
        connTesting={connTesting}
        connTestResult={connTestResult}
        handleTestConnection={handleTestConnection}
      />

      {/* مودال تعریف / ویرایش جدول مرجع */}
      <MasterDataTableModal
        isOpen={tableModalOpen}
        onClose={() => setTableModalOpen(false)}
        editingTable={editingTable}
        tableForm={tableForm}
        setTableForm={setTableForm}
        connections={connections}
        sqlPreviewLoading={sqlPreviewLoading}
        sqlPreviewResult={sqlPreviewResult}
        sqlPreviewError={sqlPreviewError}
        handlePreviewSql={handlePreviewSql}
        handleAddColumn={handleAddColumn}
        handleRemoveColumn={handleRemoveColumn}
        handleColumnChange={handleColumnChange}
        handleSaveTable={handleSaveTable}
        savingTable={savingTable}
      />

      {/* مودال مشاهده و مدیریت رکوردهای جدول مرجع */}
      <MasterDataRecordsModal
        isOpen={recordsModalOpen}
        onClose={() => setRecordsModalOpen(false)}
        selectedTable={selectedTableForRecords}
        tableRecords={tableRecords}
        recordsTotal={recordsTotal}
        recordsPage={recordsPage}
        setRecordsPage={setRecordsPage}
        recordsPageSize={recordsPageSize}
        recordsSearch={recordsSearch}
        setRecordsSearch={setRecordsSearch}
        recordsLoading={recordsLoading}
        fetchTableRecords={fetchTableRecords}
        handleOpenAddRecord={handleOpenAddRecord}
        handleOpenEditRecord={handleOpenEditRecord}
        handleToggleRecordStatus={handleToggleRecordStatus}
        recordEditModalOpen={recordEditModalOpen}
        setRecordEditModalOpen={setRecordEditModalOpen}
        editingRecord={editingRecord}
        recordFormKey={recordFormKey}
        setRecordFormKey={setRecordFormKey}
        recordFormData={recordFormData}
        setRecordFormData={setRecordFormData}
        handleSaveRecord={handleSaveRecord}
      />

      {/* مودال ایمپورت اکسل / CSV */}
      <MasterDataImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        importTable={importTable}
        importFile={importFile}
        setImportFile={setImportFile}
        importing={importing}
        handleSubmitImport={handleSubmitImport}
        handleDownloadTemplate={handleDownloadTemplate}
      />
    </div>
  );
}
