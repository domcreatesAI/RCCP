import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload, CheckCircle2, AlertTriangle, XCircle, Clock, Download,
  FileSpreadsheet, RefreshCw, Send, Info, Package,
  ChevronDown, Plus, X, Calendar,
  Database, Archive, Check,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Color Tokens ──────────────────────────────────────────────────────────────
const C = {
  textMain:       '#0F172A',
  textMuted:      '#64748B',
  blue:           '#4F46E5',
  blueTint:       '#EEF2FF',
  blueBorder:     '#C7D2FE',
  green:          '#15803D',
  greenTint:      '#F0FDF4',
  greenBorder:    '#BBF7D0',
  amber:          '#92400E',
  amberTint:      '#FFFBEB',
  amberBorder:    '#FDE68A',
  red:            '#991B1B',
  redTint:        '#FEF2F2',
  redBorder:      '#FECACA',
  border:         '#E2E8F0',
  borderLight:    '#F1F5F9',
  panel:          '#FFFFFF',
  bg:             '#F8FAFC',
};

// ─── Types ─────────────────────────────────────────────────────────────────────
type ValidationStatus = 'pass' | 'warning' | 'blocked' | 'pending' | 'running';
type FileStatus = 'uploaded' | 'not_uploaded' | 'uploading' | 'empty_valid';
type BatchStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';

interface PlanFile {
  key: string;
  label: string;
  description: string;
  required: boolean;
  status: FileStatus;
  emptyAccepted?: boolean;
  rowCount?: number;
  version?: string;
  uploadedBy?: string;
  timestamp?: string;
  size?: string;
  section: 'batch' | 'masterdata';
}
interface Batch {
  id: number;
  name: string;
  cycleDate: string;
  cycleDateDisplay: string;
  status: BatchStatus;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  hasBaseline?: boolean;
  baselineName?: string;
}
interface ValidationStep {
  id: number;
  name: string;
  status: ValidationStatus;
  message: string;
  detail?: string;
}

// ─── Mock Batch List ───────────────────────────────────────────────────────────
const batchList: Batch[] = [
  {
    id: 3, name: 'March 2026 Plan', cycleDate: '2026-03-01', cycleDateDisplay: '01 Mar 2026',
    status: 'DRAFT', createdBy: 'J. Smith', createdAt: '01 Mar 2026 08:44',
  },
  {
    id: 2, name: 'February 2026 Plan', cycleDate: '2026-02-01', cycleDateDisplay: '01 Feb 2026',
    status: 'PUBLISHED', createdBy: 'T. Hughes', createdAt: '01 Feb 2026 09:12',
    publishedAt: '05 Feb 2026 14:20', hasBaseline: true, baselineName: 'Feb 2026 — Board Submission',
  },
  {
    id: 1, name: 'January 2026 Plan', cycleDate: '2026-01-01', cycleDateDisplay: '01 Jan 2026',
    status: 'ARCHIVED', createdBy: 'J. Smith', createdAt: '01 Jan 2026 09:00',
    publishedAt: '06 Jan 2026 11:30', hasBaseline: true, baselineName: 'Jan 2026 — Baseline',
  },
];

// ─── Mock Files for March 2026 (DRAFT, partially uploaded) ────────────────────
const initialFiles: PlanFile[] = [
  // ── Section 1: 6 required SAP batch files ──
  {
    key: 'master_stock', label: 'master_stock', section: 'batch',
    description: 'Stock snapshot per SKU per warehouse (SAP MB52). total_stock_ea, free_stock_ea, safety_stock_ea.',
    required: true, status: 'uploaded', version: 'v1', uploadedBy: 'J.Smith', timestamp: '01 Mar 08:55', size: '312 KB',
  },
  {
    key: 'production_orders', label: 'production_orders', section: 'batch',
    description: 'Open production orders from SAP COOIS. LA (MRP proposals) and YPAC (released/firmed) order types.',
    required: true, status: 'uploaded', version: 'v2', uploadedBy: 'J.Smith', timestamp: '01 Mar 09:30', size: '1.4 MB',
  },
  {
    key: 'demand_plan', label: 'demand_plan', section: 'batch',
    description: 'Monthly demand per SKU per warehouse (SAP PIR). Wide format: one column per month (M03.2026, M04.2026…).',
    required: true, status: 'uploaded', version: 'v1', uploadedBy: 'J.Smith', timestamp: '01 Mar 09:02', size: '980 KB',
  },
  {
    key: 'line_capacity_calendar', label: 'line_capacity_calendar', section: 'batch',
    description: 'Daily capacity per production line: planned hours, maintenance, holiday, downtime. Must cover 12+ months forward.',
    required: true, status: 'not_uploaded',
  },
  {
    key: 'headcount_plan', label: 'headcount_plan', section: 'batch',
    description: 'Planned headcount per line per date. Compared against line_resource_requirements to flag labour shortfalls.',
    required: true, status: 'not_uploaded',
  },
  {
    key: 'portfolio_changes', label: 'portfolio_changes', section: 'batch',
    description: 'Product portfolio changes in the planning horizon. Accepts 0 rows if no changes this cycle.',
    required: true, emptyAccepted: true,
    status: 'empty_valid', version: 'v1', uploadedBy: 'J.Smith', timestamp: '01 Mar 09:08', size: '6 KB', rowCount: 0,
  },
  // ── Section 2: 4 Masterdata uploads ──
  {
    key: 'line_pack_capabilities', label: 'line_pack_capabilities', section: 'masterdata',
    description: 'Pack sizes each filling line can run and fill speed (bottles/min). Full replace on upload.',
    required: false, status: 'uploaded', version: 'v4', uploadedBy: 'T.Hughes', timestamp: '15 Feb 10:14', size: '44 KB',
  },
  {
    key: 'line_resource_requirements', label: 'line_resource_requirements', section: 'masterdata',
    description: 'Headcount per role required to run each line (e.g. A101 needs 3 Line Operators, 1 Team Leader).',
    required: false, status: 'uploaded', version: 'v3', uploadedBy: 'T.Hughes', timestamp: '15 Feb 10:18', size: '28 KB',
  },
  {
    key: 'plant_resource_requirements', label: 'plant_resource_requirements', section: 'masterdata',
    description: 'Shared headcount required at plant level regardless of lines running (e.g. forklift drivers).',
    required: false, status: 'uploaded', version: 'v2', uploadedBy: 'T.Hughes', timestamp: '15 Feb 10:21', size: '18 KB',
  },
  {
    key: 'warehouse_capacity', label: 'warehouse_capacity', section: 'masterdata',
    description: 'Max pallet positions per pack type per warehouse (UKP1, UKP3, UKP4, UKP5).',
    required: false, status: 'uploaded', version: 'v3', uploadedBy: 'T.Hughes', timestamp: '15 Feb 10:25', size: '12 KB',
  },
];

// ─── Validation Pipeline ───────────────────────────────────────────────────────
const initialValidation: ValidationStep[] = [
  {
    id: 1, name: 'Required File Check', status: 'warning',
    message: '4 of 6 required files present — 2 still missing',
    detail: 'Missing: line_capacity_calendar, headcount_plan. All 4 masterdata types are on record.',
  },
  {
    id: 2, name: 'Template / Structure Check', status: 'pass',
    message: 'Structure valid for 4 uploaded batch files',
    detail: 'master_stock, production_orders, demand_plan, and portfolio_changes all match expected column templates. portfolio_changes contains 0 data rows — accepted.',
  },
  {
    id: 3, name: 'Field Mapping Check', status: 'warning',
    message: '1 mapping issue in demand_plan',
    detail: 'demand_plan: column M09.2027 found but planning horizon ends M02.2027. Rows beyond horizon will be excluded. Not blocking.',
  },
  {
    id: 4, name: 'Data Type Check', status: 'pass',
    message: 'No type mismatches in uploaded files',
  },
  {
    id: 5, name: 'Reference Check', status: 'pass',
    message: 'All item codes and warehouse codes resolved',
    detail: 'All 847 item codes in demand_plan match items masterdata. All warehouse codes (UKP1, UKP3, UKP4, UKP5) valid.',
  },
  {
    id: 6, name: 'Business Rule Check', status: 'pending',
    message: 'Waiting for line_capacity_calendar and headcount_plan before this check can run',
  },
  {
    id: 7, name: 'Batch Readiness', status: 'blocked',
    message: 'BLOCKED — line_capacity_calendar and headcount_plan not uploaded',
    detail: 'Upload the two missing files to proceed. When all 6 files are present with no BLOCKED issues, this batch can be published.',
  },
];

// ─── Field Mapping ─────────────────────────────────────────────────────────────
const fieldMappingByFile: Record<string, { source: string; mapped: string; type: string; status: string; note: string }[]> = {
  master_stock: [
    { source: 'ItemCode',       mapped: 'item_code',      type: 'VARCHAR(50)',   status: 'pass',    note: 'Validated against items masterdata' },
    { source: 'WarehouseCode',  mapped: 'warehouse_code', type: 'VARCHAR(20)',   status: 'pass',    note: 'UKP1/UKP3/UKP4/UKP5' },
    { source: 'TotalStock',     mapped: 'total_stock_ea', type: 'DECIMAL(12,4)', status: 'pass',    note: 'EA = eaches (individual units)' },
    { source: 'FreeStock',      mapped: 'free_stock_ea',  type: 'DECIMAL(12,4)', status: 'pass',    note: 'Available to commit after sales allocations' },
    { source: 'SafetyStock',    mapped: 'safety_stock_ea',type: 'DECIMAL(12,4)', status: 'pass',    note: 'Minimum target stock level' },
  ],
  production_orders: [
    { source: 'OrderNumber',    mapped: 'order_number',       type: 'VARCHAR(20)',   status: 'pass',    note: 'SAP order ID' },
    { source: 'Material',       mapped: 'material',           type: 'VARCHAR(50)',   status: 'pass',    note: 'Validated against items masterdata' },
    { source: 'Plant',          mapped: 'plant',              type: 'VARCHAR(10)',   status: 'pass',    note: 'A1–A5' },
    { source: 'OrderType',      mapped: 'order_type',         type: 'VARCHAR(10)',   status: 'pass',    note: 'LA = MRP proposal · YPAC = released/firmed' },
    { source: 'OrderQty',       mapped: 'order_quantity',     type: 'DECIMAL(12,4)', status: 'pass',    note: 'Must be > 0' },
    { source: 'DeliveredQty',   mapped: 'delivered_quantity', type: 'DECIMAL(12,4)', status: 'pass',    note: 'net_qty = MAX(0, order_qty − delivered_qty)' },
    { source: 'StartDate',      mapped: 'basic_start_date',   type: 'DATE',          status: 'pass',    note: 'Format: DD.MM.YYYY' },
    { source: 'ProductionLine', mapped: 'production_line',    type: 'VARCHAR(10)',   status: 'warning', note: 'Nullable — YPAC often unassigned' },
  ],
  demand_plan: [
    { source: 'MaterialID',  mapped: 'material_id',       type: 'VARCHAR(50)',   status: 'pass',    note: 'Validated against items masterdata' },
    { source: 'Plant',       mapped: 'plant',             type: 'VARCHAR(10)',   status: 'pass',    note: 'A1–A5' },
    { source: 'M03.2026',    mapped: 'period_start_date', type: 'DECIMAL(12,4)', status: 'pass',    note: 'Monthly bucket. Stored as-is; weekly derived at query time.' },
    { source: 'M04.2026',    mapped: 'period_start_date', type: 'DECIMAL(12,4)', status: 'pass',    note: '' },
    { source: 'M09.2027',    mapped: '(beyond horizon)',  type: 'DECIMAL(12,4)', status: 'warning', note: 'Column beyond planning horizon — rows will be excluded' },
  ],
  portfolio_changes: [
    { source: 'ItemCode',      mapped: 'item_code',       type: 'VARCHAR(50)',   status: 'pass', note: 'Nullable — some changes are plant/line level' },
    { source: 'ChangeType',    mapped: 'change_type',     type: 'VARCHAR(30)',   status: 'pass', note: 'NEW_LAUNCH | DISCONTINUE | REFORMULATION | LINE_CHANGE | OTHER' },
    { source: 'EffectiveDate', mapped: 'effective_date',  type: 'DATE',          status: 'pass', note: '0 data rows — no changes this cycle' },
    { source: 'Description',   mapped: 'description',     type: 'VARCHAR(200)',  status: 'pass', note: '0 data rows — schema verified only' },
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: ValidationStatus }) {
  if (status === 'pass')    return <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: C.green }} />;
  if (status === 'warning') return <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#D97706' }} />;
  if (status === 'blocked') return <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: C.red }} />;
  if (status === 'running') return <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin" style={{ color: C.blue }} />;
  return <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />;
}

function ValidationBadge({ status }: { status: ValidationStatus }) {
  const map: Record<ValidationStatus, { bg: string; text: string; label: string }> = {
    pass:    { bg: C.greenTint,  text: C.green,      label: 'Pass' },
    warning: { bg: C.amberTint,  text: C.amber,       label: 'Warning' },
    blocked: { bg: C.redTint,    text: C.red,         label: 'Blocked' },
    pending: { bg: '#F8FAFC',    text: C.textMuted,   label: 'Pending' },
    running: { bg: C.blueTint,   text: C.blue,        label: 'Running' },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { bg: string; text: string; border: string }> = {
    DRAFT:     { bg: C.amberTint, text: C.amber, border: C.amberBorder },
    VALIDATED: { bg: C.blueTint,  text: C.blue,  border: C.blueBorder },
    PUBLISHED: { bg: C.greenTint, text: C.green, border: C.greenBorder },
    ARCHIVED:  { bg: '#F8FAFC',   text: C.textMuted, border: C.border },
  };
  const s = map[status];
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

// ─── New Batch Modal ───────────────────────────────────────────────────────────
function NewBatchModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('April 2026 Plan');
  const [month, setMonth] = useState('2026-04');

  function handleCreate() {
    toast.success(`Batch "${name}" created`, { description: `Plan cycle date: 01 ${new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` });
    onClose();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ border: '1px solid #E2E8F0' }}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, #EEF2FF, #F5F3FF)' }}>
          <div>
            <div className="text-sm font-bold text-gray-900">Create New Batch</div>
            <div className="text-xs text-gray-500 mt-0.5">Set the name and plan cycle date (must be 1st of month)</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/70 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Batch Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#334155' }}
              onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Plan Cycle Month</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
              style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#334155' }}
              onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }} />
            <p className="text-xs text-gray-400 mt-1">Plan cycle date will be set to the 1st of the selected month (DB constraint).</p>
          </div>
          <div className="rounded-xl p-3 flex items-start gap-2" style={{ backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE' }}>
            <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-800">
              Creating a new batch does not affect the currently PUBLISHED batch. Upload all 6 SAP files and all 4 masterdata types before publishing.
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2" style={{ backgroundColor: '#FAFAFA' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors border border-gray-200">
            Cancel
          </button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
            <Plus className="w-4 h-4" /> Create Batch
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export function PlanningData() {
  const [activeBatchId, setActiveBatchId] = useState(3); // March 2026 DRAFT
  const [showBatchDropdown, setShowBatchDropdown] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [files, setFiles] = useState<PlanFile[]>(initialFiles);
  const [validation, setValidation] = useState<ValidationStep[]>(initialValidation);
  const [validating, setValidating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>('production_orders');
  const [expandedValidation, setExpandedValidation] = useState<number | null>(1);

  const activeBatch = batchList.find(b => b.id === activeBatchId) ?? batchList[0];
  const isEditable = activeBatch.status === 'DRAFT' || activeBatch.status === 'VALIDATED';

  const batchFiles = files.filter(f => f.section === 'batch');
  const masterdataFiles = files.filter(f => f.section === 'masterdata');
  const requiredUploaded = batchFiles.filter(f => f.status === 'uploaded' || f.status === 'empty_valid').length;
  const totalRequired = batchFiles.length;
  const allMasterdataUploaded = masterdataFiles.every(f => f.status === 'uploaded');
  const hasBlocked = validation.some(v => v.status === 'blocked');
  const canPublish = requiredUploaded === totalRequired && allMasterdataUploaded && !hasBlocked;
  const canBaseline = activeBatch.status === 'PUBLISHED' && !activeBatch.hasBaseline;

  const previewableFiles = files.filter(f => f.status === 'uploaded' || f.status === 'empty_valid');
  const mappingRows = fieldMappingByFile[selectedFile] ?? [];

  function handleUpload(key: string) {
    const isPortfolio = key === 'portfolio_changes';
    setFiles(prev => prev.map(f => {
      if (f.key !== key) return f;
      if (isPortfolio) return { ...f, status: 'empty_valid', version: 'v1', uploadedBy: 'J.Smith', timestamp: 'Just now', size: '6 KB', rowCount: 0 };
      const isReupload = f.status === 'uploaded';
      const nextVer = isReupload ? `v${parseInt((f.version || 'v1').replace('v', '')) + 1}` : 'v1';
      return { ...f, status: 'uploaded', version: nextVer, uploadedBy: 'J.Smith', timestamp: 'Just now', size: '—' };
    }));
    toast.success(`${key} uploaded`, { description: isPortfolio ? 'Accepted: 0 data rows — no changes this cycle.' : 'Validation running…' });
  }

  function handleValidate() {
    setValidating(true);
    setValidation(prev => prev.map(s => ({ ...s, status: 'running' as ValidationStatus })));
    setTimeout(() => {
      setValidating(false);
      setValidation(initialValidation);
      toast.warning('Validation complete — 2 warnings, 1 blocked', { description: 'Upload the 2 missing files to proceed.' });
    }, 2200);
  }

  // ─── Lifecycle Steps ─────────────────────────────────────────────────────────
  const lifecycleSteps: { key: BatchStatus; label: string; desc: string }[] = [
    { key: 'DRAFT', label: 'Draft', desc: 'Files being uploaded' },
    { key: 'VALIDATED', label: 'Validated', desc: 'All files pass, ready to publish' },
    { key: 'PUBLISHED', label: 'Published', desc: 'Data imported; active plan' },
    { key: 'ARCHIVED', label: 'Archived', desc: 'Superseded by newer batch' },
  ];
  const statusOrder: BatchStatus[] = ['DRAFT', 'VALIDATED', 'PUBLISHED', 'ARCHIVED'];
  const currentStepIdx = statusOrder.indexOf(activeBatch.status);

  return (
    <div className="p-6 space-y-5" style={{ color: C.textMain, minHeight: '100%' }}>

      {/* New Batch Modal */}
      <AnimatePresence>
        {showNewBatchModal && <NewBatchModal onClose={() => setShowNewBatchModal(false)} />}
      </AnimatePresence>

      {/* ── Page Header ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Planning Data</h1>
        <p className="text-sm mt-0.5 text-gray-500">
          Upload and validate the 6 SAP batch files and 4 masterdata types for each monthly planning cycle, then publish and create a baseline.
        </p>
      </motion.div>

      {/* ── Batch Selector ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-visible"
        style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div className="px-5 py-4">
          <div className="flex items-start gap-4">
            {/* Batch Selector Dropdown */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Active Planning Batch</div>
              <div className="relative">
                <button
                  onClick={() => setShowBatchDropdown(!showBatchDropdown)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full text-left"
                  style={{
                    borderColor: showBatchDropdown ? '#6366F1' : '#E2E8F0',
                    backgroundColor: showBatchDropdown ? '#EEF2FF' : '#F8FAFC',
                    boxShadow: showBatchDropdown ? '0 0 0 3px rgba(99,102,241,0.1)' : 'none',
                  }}>
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-sm text-gray-900">{activeBatch.name}</span>
                      <BatchStatusBadge status={activeBatch.status} />
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Cycle date: {activeBatch.cycleDateDisplay} · Created by {activeBatch.createdBy} · {activeBatch.createdAt}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
                    style={{ transform: showBatchDropdown ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                </button>

                {/* Dropdown */}
                <AnimatePresence>
                  {showBatchDropdown && (
                    <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20">
                      {batchList.map(b => (
                        <button key={b.id} onClick={() => { setActiveBatchId(b.id); setShowBatchDropdown(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b last:border-0 border-gray-100 hover:bg-gray-50"
                          style={{ backgroundColor: b.id === activeBatchId ? '#EEF2FF' : 'transparent' }}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${b.status === 'DRAFT' ? 'bg-amber-400' : b.status === 'VALIDATED' ? 'bg-blue-500' : b.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900">{b.name}</span>
                              {b.hasBaseline && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">Baseline</span>}
                            </div>
                            <div className="text-xs text-gray-400">{b.cycleDateDisplay} · {b.status}</div>
                          </div>
                          {b.id === activeBatchId && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                        </button>
                      ))}
                      <button onClick={() => { setShowBatchDropdown(false); setShowNewBatchModal(true); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors bg-gray-50 hover:bg-gray-100 border-t border-gray-200">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-600">Create New Batch…</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Lifecycle Steps */}
            <div className="shrink-0">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Lifecycle</div>
              <div className="flex items-center gap-1">
                {lifecycleSteps.map((step, i) => {
                  const isDone = statusOrder.indexOf(step.key) < currentStepIdx;
                  const isCurrent = step.key === activeBatch.status;
                  const isUpcoming = statusOrder.indexOf(step.key) > currentStepIdx;
                  return (
                    <div key={step.key} className="flex items-center gap-1">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            backgroundColor: isDone ? '#22C55E' : isCurrent ? '#6366F1' : '#F1F5F9',
                            color: isDone || isCurrent ? '#FFF' : '#94A3B8',
                          }}>
                          {isDone ? '✓' : i + 1}
                        </div>
                        <div className="text-center mt-0.5">
                          <div className="text-xs font-semibold whitespace-nowrap"
                            style={{ color: isCurrent ? '#6366F1' : isDone ? '#22C55E' : '#94A3B8', fontSize: 9 }}>
                            {step.label}
                          </div>
                        </div>
                      </div>
                      {i < lifecycleSteps.length - 1 && (
                        <div className="w-6 h-0.5 mb-3 rounded-full"
                          style={{ backgroundColor: isDone ? '#22C55E' : '#F1F5F9' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* New Batch Button */}
            <div className="shrink-0">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2 opacity-0">—</div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setShowNewBatchModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', borderColor: '#DDD6FE' }}>
                <Plus className="w-3.5 h-3.5" /> New Batch
              </motion.button>
            </div>
          </div>

          {/* Baseline banner */}
          {activeBatch.status === 'PUBLISHED' && activeBatch.hasBaseline && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 border"
              style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="text-xs text-emerald-800">
                <strong>Active Baseline:</strong> {activeBatch.baselineName} — locked and audit-trailed.
              </div>
            </motion.div>
          )}
          {activeBatch.status === 'PUBLISHED' && !activeBatch.hasBaseline && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2.5 border"
              style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="text-xs text-amber-800">Batch is PUBLISHED — no baseline created yet. Create a baseline to lock this cycle as an audit record.</div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ── Files + Validation ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '3fr 2fr' }}>

        {/* ── Files Table ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

          {/* Section 1: Batch Files */}
          <div className="px-5 pt-4 pb-2 border-b border-gray-100"
            style={{ background: 'linear-gradient(to right, #F8FAFC, white)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-bold text-gray-900">SAP Batch Files</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  6 required files from SAP — all must be present before batch can be published
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold"
                style={{ backgroundColor: requiredUploaded < totalRequired ? C.redTint : C.greenTint, borderColor: requiredUploaded < totalRequired ? C.redBorder : C.greenBorder, color: requiredUploaded < totalRequired ? C.red : C.green }}>
                {requiredUploaded}/{totalRequired} present
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  {['File (SAP source)', 'Status', 'Ver.', 'Uploaded by', 'Time', 'Actions'].map(h => (
                    <th key={h} className="text-left pb-2 text-xs font-semibold text-gray-500 whitespace-nowrap pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batchFiles.map((f, fi) => {
                  const isSelected = selectedFile === f.key;
                  const isPresent = f.status === 'uploaded' || f.status === 'empty_valid';
                  return (
                    <motion.tr key={f.key}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: fi * 0.04 }}
                      className="border-b last:border-0 cursor-pointer transition-colors"
                      style={{ borderColor: C.borderLight, backgroundColor: isSelected ? '#EEF2FF' : 'transparent' }}
                      onClick={() => isPresent && setSelectedFile(f.key)}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}>
                      {/* File name */}
                      <td className="py-2.5 pr-3" style={{ minWidth: 200 }}>
                        <div className="flex items-start gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-semibold" style={{ color: isSelected ? C.blue : C.textMain }}>
                                {f.label}
                              </span>
                              {f.emptyAccepted && (
                                <span className="text-xs px-1.5 py-px rounded font-medium bg-indigo-50 text-indigo-600" style={{ fontSize: 9 }}>empty OK</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5 leading-tight" style={{ fontSize: 10 }}>{f.description}</div>
                          </div>
                        </div>
                      </td>
                      {/* Status */}
                      <td className="py-2.5 pr-3" style={{ minWidth: 140 }}>
                        {f.status === 'empty_valid' ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Empty — valid
                            </span>
                            <div className="text-xs text-gray-400 mt-0.5" style={{ fontSize: 10 }}>0 rows · no changes</div>
                          </div>
                        ) : f.status === 'uploaded' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                            <XCircle className="w-3.5 h-3.5" /> Not uploaded
                          </span>
                        )}
                      </td>
                      {/* Ver */}
                      <td className="py-2.5 pr-3 text-xs text-gray-500">{f.version || '—'}</td>
                      {/* Uploaded by */}
                      <td className="py-2.5 pr-3 text-xs text-gray-500">{f.uploadedBy || '—'}</td>
                      {/* Time */}
                      <td className="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap">{f.timestamp || '—'}</td>
                      {/* Actions */}
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <button title="Download template"
                            onClick={e => { e.stopPropagation(); toast.info(`Downloading ${f.label} template…`); }}
                            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
                            style={{ borderColor: C.border, color: C.textMuted }}>
                            <Download className="w-3 h-3" /> Tmpl
                          </button>
                          {isPresent && (
                            <button title="Download uploaded file"
                              onClick={e => { e.stopPropagation(); toast.info(`Downloading ${f.label}…`); }}
                              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border transition-colors hover:bg-gray-100"
                              style={{ borderColor: C.border, color: C.textMuted }}>
                              <Download className="w-3 h-3" /> Excel
                            </button>
                          )}
                          {isEditable && (
                            <button onClick={e => { e.stopPropagation(); handleUpload(f.key); }}
                              className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
                              style={{
                                backgroundColor: isPresent ? '#F8FAFC' : C.blueTint,
                                color: isPresent ? C.textMuted : C.blue,
                                border: `1px solid ${isPresent ? C.border : C.blueBorder}`,
                              }}>
                              <Upload className="w-3 h-3" /> {isPresent ? 'Re-upload' : 'Upload'}
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 2: Masterdata Uploads */}
          <div className="px-5 pt-4 pb-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-violet-600" />
                  <div className="text-sm font-bold text-gray-900">Masterdata Uploads</div>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 ml-5.5">
                  4 reference datasets — full-replace on upload. Required before publishing any batch.
                </div>
              </div>
              {allMasterdataUploaded ? (
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">All current</span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-lg font-semibold bg-amber-50 text-amber-700 border border-amber-200">Needs update</span>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {masterdataFiles.map((f, fi) => (
                  <motion.tr key={f.key}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + fi * 0.05 }}
                    className="border-b last:border-0 hover:bg-gray-50 transition-colors"
                    style={{ borderColor: C.borderLight }}>
                    <td className="py-2.5 pr-3" style={{ minWidth: 200 }}>
                      <div className="flex items-start gap-2">
                        <Package className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-400" />
                        <div>
                          <div className="font-mono text-xs font-semibold text-gray-900">{f.label}</div>
                          <div className="text-xs text-gray-400 mt-0.5" style={{ fontSize: 10 }}>{f.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {f.status === 'uploaded' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> On record
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Not uploaded
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500">{f.version || '—'}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500">{f.uploadedBy || '—'}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-400 whitespace-nowrap">{f.timestamp || '—'}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => toast.info(`Downloading ${f.label} template…`)}
                          className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border hover:bg-gray-100 transition-colors"
                          style={{ borderColor: C.border, color: C.textMuted }}>
                          <Download className="w-3 h-3" /> Tmpl
                        </button>
                        {f.status === 'uploaded' && (
                          <button onClick={() => toast.info(`Downloading ${f.label}…`)}
                            className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-xs border hover:bg-gray-100 transition-colors"
                            style={{ borderColor: C.border, color: C.textMuted }}>
                            <Download className="w-3 h-3" /> Excel
                          </button>
                        )}
                        <button onClick={() => handleUpload(f.key)}
                          className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold transition-colors"
                          style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
                          <Upload className="w-3 h-3" /> {f.status === 'uploaded' ? 'Re-upload' : 'Upload'}
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* ── Validation Panel ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(to right, #F8FAFC, white)' }}>
            <div>
              <div className="text-sm font-bold text-gray-900">Validation Pipeline</div>
              <div className="text-xs text-gray-500 mt-0.5">7-stage automated check · runs on each file upload</div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {validation.map((step, si) => (
              <motion.div key={step.id}
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + si * 0.05 }}>
                <button onClick={() => setExpandedValidation(expandedValidation === step.id ? null : step.id)}
                  className="w-full px-5 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors">
                  <StatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{step.id}. {step.name}</span>
                      <ValidationBadge status={step.status} />
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.message}</div>
                  </div>
                  {step.detail && (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5 transition-transform duration-200"
                      style={{ transform: expandedValidation === step.id ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  )}
                </button>
                <AnimatePresence>
                  {expandedValidation === step.id && step.detail && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                      className="overflow-hidden">
                      <div className="px-5 pb-3 ml-7 text-xs text-gray-600 leading-relaxed"
                        style={{ borderLeft: `2px solid ${step.status === 'blocked' ? '#FECACA' : step.status === 'warning' ? '#FDE68A' : '#BBF7D0'}`, marginLeft: '28px', paddingLeft: '12px' }}>
                        {step.detail}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── Field Mapping Detail ── */}
      {previewableFiles.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-3">
            <div className="text-sm font-bold text-gray-900">Field Mapping Detail</div>
            <div className="flex items-center gap-1 ml-auto flex-wrap">
              {previewableFiles.map(f => (
                <button key={f.key} onClick={() => setSelectedFile(f.key)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all"
                  style={{
                    backgroundColor: selectedFile === f.key ? C.blueTint : '#F8FAFC',
                    color: selectedFile === f.key ? C.blue : C.textMuted,
                    border: `1px solid ${selectedFile === f.key ? C.blueBorder : C.border}`,
                  }}>
                  {f.key}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#F8FAFC' }}>
                <tr>
                  {['SAP Column Name', 'Maps to (DB field)', 'Type', 'Status', 'Notes'].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappingRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-6 text-xs text-center text-gray-400">No mapping data available for this file</td></tr>
                ) : mappingRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50 transition-colors" style={{ borderColor: '#F1F5F9' }}>
                    <td className="px-5 py-2.5 font-mono text-xs font-semibold text-indigo-700">{row.source}</td>
                    <td className="px-5 py-2.5 font-mono text-xs text-gray-600">{row.mapped}</td>
                    <td className="px-5 py-2.5 text-xs text-gray-500">{row.type}</td>
                    <td className="px-5 py-2.5"><ValidationBadge status={row.status as ValidationStatus} /></td>
                    <td className="px-5 py-2.5 text-xs text-gray-500">{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ── Action Bar ── */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-white rounded-2xl border border-gray-200 px-5 py-4"
        style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleValidate} disabled={!isEditable || validating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40"
              style={{ backgroundColor: '#F8FAFC', color: C.textMuted, borderColor: C.border }}>
              <RefreshCw className={`w-4 h-4 ${validating ? 'animate-spin' : ''}`} />
              {validating ? 'Running…' : 'Re-validate'}
            </motion.button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              disabled={!isEditable}
              onClick={() => toast.warning('Reset batch? This deletes all uploaded files and returns to DRAFT.', { action: { label: 'Confirm', onClick: () => toast.success('Batch reset to DRAFT') } })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40"
              style={{ backgroundColor: C.redTint, color: C.red, borderColor: C.redBorder }}>
              <Archive className="w-4 h-4" /> Reset Batch
            </motion.button>
          </div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: canPublish ? 1.03 : 1 }} whileTap={{ scale: canPublish ? 0.97 : 1 }}
              disabled={!canPublish || !isEditable}
              onClick={() => toast.success('Batch published', { description: 'Planning data imported into production tables. Active plan updated.' })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canPublish && isEditable ? 'linear-gradient(135deg, #4F46E5, #7C3AED)' : '#94A3B8', boxShadow: canPublish && isEditable ? '0 4px 14px rgba(99,102,241,0.4)' : 'none' }}>
              <Send className="w-4 h-4" /> Publish Batch
            </motion.button>
            <motion.button whileHover={{ scale: canBaseline ? 1.03 : 1 }} whileTap={{ scale: canBaseline ? 0.97 : 1 }}
              disabled={!canBaseline}
              onClick={() => toast.success('Baseline created', { description: 'This planning cycle is now locked as an audit record.' })}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canBaseline ? 'linear-gradient(135deg, #059669, #047857)' : '#94A3B8', boxShadow: canBaseline ? '0 4px 14px rgba(5,150,105,0.4)' : 'none' }}>
              <CheckCircle2 className="w-4 h-4" /> Create Baseline
            </motion.button>
          </div>
        </div>
        {!canPublish && isEditable && (
          <div className="mt-3 text-xs text-gray-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Publish requires: all 6 batch files present · no BLOCKED validation issues · all 4 masterdata types on record.
          </div>
        )}
      </motion.div>
    </div>
  );
}
