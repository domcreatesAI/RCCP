import { useState } from 'react';
import {
  Plus, Download, Upload, RefreshCw, Edit2, ChevronDown,
  ChevronUp, Eye, EyeOff, Database, Check, X, AlertTriangle,
  Shield, Server, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabId = 'item-resource' | 'risk-scoring' | 'rec-display' | 'oee-targets' | 'cost-rates' | 'reason-codes';

const TABS: { id: TabId; label: string }[] = [
  { id: 'item-resource', label: 'Item-Resource Rules' },
  { id: 'risk-scoring', label: 'Risk Scoring Rules' },
  { id: 'rec-display', label: 'Recommendation Display' },
  { id: 'oee-targets', label: 'OEE Targets' },
  { id: 'cost-rates', label: 'Cost Rates' },
  { id: 'reason-codes', label: 'Reason Codes' },
];

// ─── Mock Data ────────────────────────────────────────────────────────────────
const itemResourceRows = [
  { id: 'IRR-0041', itemGroup: 'A-Range Core', line: 'A201', stdHrs: 0.340, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 3 },
  { id: 'IRR-0042', itemGroup: 'A-Range Core', line: 'A202', stdHrs: 0.340, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 3 },
  { id: 'IRR-0043', itemGroup: 'B-Range Standard', line: 'A101', stdHrs: 0.285, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 2 },
  { id: 'IRR-0044', itemGroup: 'B-Range Standard', line: 'A102', stdHrs: 0.285, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 2 },
  { id: 'IRR-0045', itemGroup: 'B-Range Standard', line: 'A103', stdHrs: 0.285, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 2 },
  { id: 'IRR-0046', itemGroup: 'C-Range Premium', line: 'A302', stdHrs: 0.420, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 1 },
  { id: 'IRR-0047', itemGroup: 'C-Range Premium', line: 'A303', stdHrs: 0.420, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 2 },
  { id: 'IRR-0048', itemGroup: 'D-Range Launch', line: 'A304', stdHrs: 0.510, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 1 },
  { id: 'IRR-0049', itemGroup: 'D-Range Launch', line: 'A305', stdHrs: 0.510, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 1 },
  { id: 'IRR-0050', itemGroup: 'E-Range Specialist', line: 'A401', stdHrs: 0.620, validFrom: '01 Jan 2025', validTo: '31 Dec 2025', status: 'Active', version: 1 },
  { id: 'IRR-0031', itemGroup: 'B-Range Standard', line: 'A307', stdHrs: 0.295, validFrom: '01 Jul 2024', validTo: '31 Dec 2024', status: 'Archived', version: 1 },
];

const riskScoringRows = [
  { id: 'RSR-001', level: 'Critical', baseScore: 100, capGapWt: 0.5, labourWt: 2.0, costWt: 15, active: true, version: 2 },
  { id: 'RSR-002', level: 'High', baseScore: 70, capGapWt: 0.5, labourWt: 2.0, costWt: 10, active: true, version: 2 },
  { id: 'RSR-003', level: 'Watch', baseScore: 40, capGapWt: 0.3, labourWt: 1.5, costWt: 5, active: true, version: 2 },
  { id: 'RSR-004', level: 'Stable', baseScore: 0, capGapWt: 0.0, labourWt: 0.0, costWt: 0, active: true, version: 1 },
];

const oeeTargetRows = [
  // Baseline OEE = 55% site average (Gravesend). Targets are 12-month improvement goals.
  // Current = rolling 4-week average. Configurable per line.
  { line: 'A101', target: 65, current: 53, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A102', target: 65, current: 56, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A103', target: 65, current: 58, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A201', target: 68, current: 55, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A202', target: 68, current: 54, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A302', target: 63, current: 52, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A303', target: 63, current: 55, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A304', target: 68, current: 55, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A305', target: 68, current: 56, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A307', target: 63, current: 57, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A308', target: 63, current: 59, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A401', target: 62, current: 54, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A501', target: 65, current: 56, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
  { line: 'A502', target: 65, current: 55, source: 'Rolling 4-week avg', validFrom: '01 Jan 2026', status: 'Active' },
];

const costRateRows = [
  { id: 'CR-001', type: 'Standard Labour Rate', value: '£28.50', currency: 'GBP', unit: '/ hour', validFrom: '01 Jan 2025', notes: 'Average across all grades' },
  { id: 'CR-002', type: 'Overtime Rate (x1.5)', value: '£42.75', currency: 'GBP', unit: '/ hour', validFrom: '01 Jan 2025', notes: '' },
  { id: 'CR-003', type: 'Overtime Rate (x2.0)', value: '£57.00', currency: 'GBP', unit: '/ hour', validFrom: '01 Jan 2025', notes: 'Weekend and bank holiday' },
  { id: 'CR-004', type: 'Temporary Operator (Agency)', value: '£280.00', currency: 'GBP', unit: '/ week', validFrom: '01 Jan 2025', notes: 'Agency fully managed rate' },
  { id: 'CR-005', type: 'Downtime Cost (unplanned)', value: '£1,200.00', currency: 'GBP', unit: '/ hour', validFrom: '01 Jan 2025', notes: 'Includes loss, waste, recovery' },
  { id: 'CR-006', type: 'Planned Maintenance Cost', value: '£380.00', currency: 'GBP', unit: '/ event', validFrom: '01 Jan 2025', notes: '' },
];

const reasonCodeRows = [
  { code: 'OVL-CAP', category: 'Overload', description: 'Capacity overload — required hours exceed available', active: true },
  { code: 'OVL-LAB', category: 'Overload', description: 'Labour overload — headcount insufficient for demand', active: true },
  { code: 'OEE-LOW', category: 'OEE', description: 'OEE below target — effective capacity reduced', active: true },
  { code: 'OEE-TGT', category: 'OEE', description: 'OEE target uplift — assumed improvement applied', active: true },
  { code: 'MAINT-SCHED', category: 'Maintenance', description: 'Scheduled maintenance window', active: true },
  { code: 'MAINT-UNPL', category: 'Maintenance', description: 'Unplanned maintenance event', active: true },
  { code: 'LAUNCH', category: 'Portfolio', description: 'New product launch volume uplift', active: true },
  { code: 'DISCONT', category: 'Portfolio', description: 'Product discontinuation — volume reduction', active: true },
  { code: 'DEMAND-UP', category: 'Demand', description: 'Demand forecast uplift vs. previous cycle', active: true },
  { code: 'DEMAND-DN', category: 'Demand', description: 'Demand forecast reduction vs. previous cycle', active: true },
  { code: 'TEMP-LAB', category: 'Labour', description: 'Temporary operator hours added', active: true },
  { code: 'OT-APPVD', category: 'Labour', description: 'Overtime hours approved', active: true },
];

const recDisplayRows = [
  { id: 'RDR-001', trigger: 'Gap % > 20% AND status = Critical', template: 'Request emergency overtime or temp operators for {{line}} in {{weeks}}', priority: 1, active: true, version: 2 },
  { id: 'RDR-002', trigger: 'OEE < target - 5pp', template: 'Initiate OEE improvement programme on {{line}} — target {{target}}% by {{week}}', priority: 2, active: true, version: 1 },
  { id: 'RDR-003', trigger: 'Maintenance conflict AND launch flag = true', template: 'Reschedule maintenance on {{line}} — conflicts with launch window {{weeks}}', priority: 1, active: true, version: 1 },
  { id: 'RDR-004', trigger: 'Labour shortage AND gap > 0h', template: 'Raise staffing request for {{line}} — minimum {{ops}} operators for {{weeks}}', priority: 1, active: true, version: 2 },
  { id: 'RDR-005', trigger: 'Launch volume > baseline + 10%', template: 'Review launch volume split for {{item_group}} — consider deferring {{pct}}% to {{week}}', priority: 2, active: true, version: 1 },
  { id: 'RDR-006', trigger: 'Stable lines with headroom > 15%', template: 'Evaluate demand rebalancing to {{line}} — {{hours}}h headroom available', priority: 3, active: false, version: 1 },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const s = status === 'Active' ? { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' } :
            status === 'Archived' ? { bg: '#F1F5F9', text: '#64748B', border: '#E2E8F0' } :
            { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' };
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{status}</span>;
}

// ─── Side Panel ───────────────────────────────────────────────────────────────
function SidePanel({ row, tab, onClose }: { row: any; tab: TabId; onClose: () => void }) {
  const [formVals, setFormVals] = useState({ ...row });
  return (
    <div className="w-80 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col" style={{ boxShadow: '-2px 0 12px rgba(0,0,0,0.04)' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>Edit Record</div>
          <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{row.id || row.line || row.code || row.level}</div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center">
          <X className="w-3.5 h-3.5" style={{ color: '#64748B' }} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {Object.entries(row).map(([key, val]) => {
          if (key === 'id' || key === 'version') return null;
          return (
            <div key={key}>
              <label className="text-xs font-medium block mb-1" style={{ color: '#64748B', textTransform: 'capitalize' }}>
                {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1')}
              </label>
              {typeof val === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormVals((p: any) => ({ ...p, [key]: !p[key] }))}
                    className="w-9 h-5 rounded-full transition-colors relative"
                    style={{ backgroundColor: formVals[key] ? '#2563EB' : '#CBD5E1' }}
                  >
                    <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all" style={{ left: formVals[key] ? '18px' : '2px' }} />
                  </button>
                  <span className="text-xs" style={{ color: '#64748B' }}>{formVals[key] ? 'Active' : 'Inactive'}</span>
                </div>
              ) : (
                <input
                  value={String(formVals[key] ?? '')}
                  onChange={e => setFormVals((p: any) => ({ ...p, [key]: e.target.value }))}
                  className="w-full rounded-md px-3 py-1.5 text-xs outline-none transition-colors"
                  style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#334155' }}
                  onFocus={e => e.target.style.borderColor = '#2563EB'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
              )}
            </div>
          );
        })}
        <div className="rounded-lg p-3" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
          <div className="text-xs font-medium mb-1" style={{ color: '#64748B' }}>Audit Information</div>
          <div className="text-xs space-y-0.5" style={{ color: '#94A3B8' }}>
            <div>Last modified: 20 Jan 2025 by T.Hughes</div>
            <div>Version: {row.version || 1} · Created: 01 Jan 2025</div>
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-slate-100 space-y-2">
        <button
          onClick={() => { toast.success('Record updated', { description: `${row.id || row.line || row.code} saved.` }); onClose(); }}
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: '#2563EB', color: '#FFFFFF' }}
        >
          Save Changes
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => toast.warning('Record set to Inactive')}
            className="py-2 rounded-lg text-xs font-medium transition-colors border"
            style={{ borderColor: '#E2E8F0', color: '#64748B', backgroundColor: '#F8FAFC' }}
          >
            Set Inactive
          </button>
          <button
            onClick={() => toast.info('Record archived (no deletion)')}
            className="py-2 rounded-lg text-xs font-medium transition-colors border"
            style={{ borderColor: '#E2E8F0', color: '#64748B', backgroundColor: '#F8FAFC' }}
          >
            Archive
          </button>
        </div>
        <div className="text-xs text-center" style={{ color: '#94A3B8' }}>Hard delete is not permitted. Archive preserves full history.</div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function Configuration() {
  const [activeTab, setActiveTab] = useState<TabId>('item-resource');
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [excelOpen, setExcelOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [showDbPw, setShowDbPw] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<null | 'ok' | 'fail'>(null);

  function testConnection() {
    setTestingConn(true);
    setConnResult(null);
    setTimeout(() => { setTestingConn(false); setConnResult('ok'); }, 1600);
  }

  function getRows() {
    if (activeTab === 'item-resource') return itemResourceRows;
    if (activeTab === 'risk-scoring') return riskScoringRows;
    if (activeTab === 'oee-targets') return oeeTargetRows;
    if (activeTab === 'cost-rates') return costRateRows;
    if (activeTab === 'reason-codes') return reasonCodeRows;
    if (activeTab === 'rec-display') return recDisplayRows;
    return [];
  }

  function getHeaders() {
    if (activeTab === 'item-resource') return ['Rule ID', 'Item Group', 'Line', 'Std Hrs/Unit', 'Valid From', 'Valid To', 'Status', 'Ver.', ''];
    if (activeTab === 'risk-scoring') return ['Rule ID', 'Level', 'Base Score', 'Cap Gap Wt', 'Labour Wt', 'Cost Wt (%)', 'Active', 'Ver.', ''];
    if (activeTab === 'oee-targets') return ['Line', 'Target OEE %', 'Current OEE %', 'Gap', 'Source', 'Valid From', 'Status', ''];
    if (activeTab === 'cost-rates') return ['ID', 'Rate Type', 'Value', 'Currency', 'Unit', 'Valid From', 'Notes', ''];
    if (activeTab === 'reason-codes') return ['Code', 'Category', 'Description', 'Active', ''];
    if (activeTab === 'rec-display') return ['Rule ID', 'Trigger', 'Template', 'Priority', 'Active', 'Ver.', ''];
    return [];
  }

  function renderCell(row: any, header: string) {
    if (header === '' || header === 'Action') return (
      <button onClick={() => setSelectedRow(row)} className="flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors hover:bg-slate-50" style={{ borderColor: '#E2E8F0', color: '#64748B' }}>
        <Edit2 className="w-3 h-3" /> Edit
      </button>
    );
    if (header === 'Status') return <StatusChip status={row.status} />;
    if (header === 'Active') return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: row.active ? '#16A34A' : '#94A3B8' }}>
        {row.active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
        {row.active ? 'Yes' : 'No'}
      </span>
    );
    if (header === 'Target OEE %') return <span className="text-xs font-semibold tabular-nums" style={{ color: '#334155' }}>{row.target}%</span>;
    if (header === 'Current OEE %') return <span className="text-xs font-semibold tabular-nums" style={{ color: row.current < row.target ? '#DC2626' : '#16A34A' }}>{row.current}%</span>;
    if (header === 'Gap') {
      const gap = row.current - row.target;
      return <span className="text-xs font-semibold" style={{ color: gap >= 0 ? '#16A34A' : '#DC2626' }}>{gap > 0 ? '+' : ''}{gap}pp</span>;
    }

    // Generic cell
    const keyMap: Record<string, string> = {
      'Rule ID': 'id', 'Item Group': 'itemGroup', 'Line': 'line', 'Std Hrs/Unit': 'stdHrs',
      'Valid From': 'validFrom', 'Valid To': 'validTo', 'Ver.': 'version',
      'Level': 'level', 'Base Score': 'baseScore', 'Cap Gap Wt': 'capGapWt',
      'Labour Wt': 'labourWt', 'Cost Wt (%)': 'costWt',
      'Source': 'source', 'ID': 'id', 'Rate Type': 'type', 'Value': 'value',
      'Currency': 'currency', 'Unit': 'unit', 'Notes': 'notes',
      'Code': 'code', 'Category': 'category', 'Description': 'description',
      'Trigger': 'trigger', 'Template': 'template', 'Priority': 'priority',
    };
    const key = keyMap[header];
    const val = key ? row[key] : '';
    const isId = header === 'Rule ID' || header === 'ID' || header === 'Code';
    const isLine = header === 'Line';
    return (
      <span className="text-xs" style={{ color: isId ? '#1E40AF' : isLine ? '#1E40AF' : '#334155', fontFamily: isId || isLine ? 'monospace' : 'inherit', fontWeight: isId || isLine ? 500 : 400 }}>
        {String(val ?? '—')}
      </span>
    );
  }

  const rows = getRows();
  const headers = getHeaders();

  return (
    <div className="flex flex-col min-h-0" style={{ color: '#0F172A' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold" style={{ color: '#0F172A' }}>Configuration & Masterdata</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
          Persistent rules, reference data, and scoring logic. Changes are versioned and audit-trailed. Not cycle-specific.
        </p>
      </div>

      {/* Tabs */}
      <div className="px-6 border-b border-slate-200" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSelectedRow(null); }}
              className="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px"
              style={{
                color: activeTab === tab.id ? '#2563EB' : '#64748B',
                borderBottomColor: activeTab === tab.id ? '#2563EB' : 'transparent',
                backgroundColor: 'transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-slate-100" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toast.info('Opening new record form…')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: '#2563EB', color: '#FFFFFF' }}
          >
            <Plus className="w-3.5 h-3.5" /> Add New
          </button>
          <div className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: '#64748B', borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
            {rows.length} records
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#94A3B8' }}>
          Version: <strong style={{ color: '#475569' }}>v2.1</strong>
          &nbsp;·&nbsp;Last published: <strong style={{ color: '#475569' }}>20 Jan 2025</strong>
          &nbsp;·&nbsp;By: T.Hughes
        </div>
      </div>

      {/* Table + Side Panel */}
      <div className="flex" style={{ backgroundColor: '#FFFFFF' }}>
        {/* Table */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead style={{ backgroundColor: '#F8FAFC', position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                {headers.map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-xs" style={{ color: '#64748B', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, idx: number) => {
                const isSelected = selectedRow && (row.id || row.line || row.code) === (selectedRow.id || selectedRow.line || selectedRow.code);
                return (
                  <tr
                    key={idx}
                    className="border-b last:border-0 transition-colors cursor-pointer"
                    style={{ borderColor: '#F1F5F9', backgroundColor: isSelected ? '#EFF6FF' : 'transparent' }}
                    onClick={() => setSelectedRow(isSelected ? null : row)}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F8FAFC'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
                  >
                    {headers.map(h => (
                      <td key={h} className="px-4 py-2.5">
                        {renderCell(row, h)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Side Panel */}
        {selectedRow && <SidePanel row={selectedRow} tab={activeTab} onClose={() => setSelectedRow(null)} />}
      </div>

      {/* Excel Workflow */}
      <div className="border-t border-slate-200" style={{ backgroundColor: '#FFFFFF' }}>
        <button
          onClick={() => setExcelOpen(p => !p)}
          className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium transition-colors hover:bg-slate-50"
          style={{ color: '#334155' }}
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" style={{ color: '#64748B' }} />
            Excel Workflow — Bulk Import / Export
          </div>
          {excelOpen ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
        </button>
        {excelOpen && (
          <div className="px-6 pb-5 grid grid-cols-4 gap-4">
            {[
              { label: 'Download current config to Excel', icon: Download, desc: 'Exports active records for this tab', action: () => toast.info('Downloading current config…'), color: '#1D4ED8', bg: '#EFF6FF' },
              { label: 'Upload partial update', icon: Upload, desc: 'Merges changes — existing records unchanged unless included', action: () => toast.info('Opening partial update upload…'), color: '#059669', bg: '#F0FDF4' },
              { label: 'Upload full-sheet replacement', icon: RefreshCw, desc: 'Replaces all active records with uploaded sheet', action: () => toast.warning('Full-sheet replacement — confirm before proceeding'), color: '#D97706', bg: '#FFFBEB' },
              { label: 'Validate & Publish new version', icon: CheckCircle2, desc: 'Runs validation checks and publishes to v2.2', action: () => { toast.success('Configuration v2.2 published', { description: 'All 6 tabs validated and committed.' }); }, color: '#7C3AED', bg: '#F3E8FF' },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                className="flex items-start gap-3 p-3.5 rounded-xl text-left transition-colors border hover:opacity-90"
                style={{ backgroundColor: item.bg, borderColor: 'transparent' }}
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'white' }}>
                  <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                </div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: item.color }}>{item.label}</div>
                  <div className="text-xs mt-0.5 leading-relaxed" style={{ color: '#64748B' }}>{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Admin Section */}
      <div className="border-t border-slate-200" style={{ backgroundColor: '#FFFFFF' }}>
        <button
          onClick={() => setAdminOpen(p => !p)}
          className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium transition-colors hover:bg-slate-50"
          style={{ color: '#334155' }}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: '#64748B' }} />
            Technical Configuration
            <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>Admin only</span>
          </div>
          {adminOpen ? <ChevronUp className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} />}
        </button>
        {adminOpen && (
          <div className="px-6 pb-6">
            <div className="rounded-xl border p-5" style={{ backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }}>
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-4 h-4" style={{ color: '#64748B' }} />
                <div className="text-sm font-semibold" style={{ color: '#334155' }}>Database Connection</div>
                <div className="w-2 h-2 rounded-full ml-auto" style={{ backgroundColor: connResult === 'ok' ? '#22C55E' : connResult === 'fail' ? '#EF4444' : '#CBD5E1' }}></div>
                {connResult === 'ok' && <span className="text-xs" style={{ color: '#16A34A' }}>Connected</span>}
                {connResult === 'fail' && <span className="text-xs" style={{ color: '#DC2626' }}>Connection failed</span>}
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Database Host / IP', value: '10.142.88.21', type: 'text', masked: false },
                  { label: 'Port', value: '5432', type: 'text', masked: false },
                  { label: 'Database Name', value: 'rccp_production', type: 'text', masked: false },
                  { label: 'Schema', value: 'rccp_core', type: 'text', masked: false },
                  { label: 'Environment', value: 'Production', type: 'select', masked: false },
                  { label: 'Connection Password', value: '••••••••••••', type: 'password', masked: true },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>{field.label}</label>
                    <div className="relative">
                      {field.masked ? (
                        <div className="flex items-center gap-2">
                          <input
                            type={showDbPw ? 'text' : 'password'}
                            defaultValue="secret_value_hidden"
                            readOnly
                            className="flex-1 rounded-md px-3 py-1.5 text-xs outline-none"
                            style={{ border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', color: '#334155', letterSpacing: '0.2em' }}
                          />
                          <button onClick={() => setShowDbPw(p => !p)} className="p-1.5 rounded hover:bg-slate-100">
                            {showDbPw ? <EyeOff className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} /> : <Eye className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />}
                          </button>
                        </div>
                      ) : field.type === 'select' ? (
                        <select className="w-full rounded-md px-3 py-1.5 text-xs outline-none" style={{ border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', color: '#334155' }}>
                          <option>Production</option>
                          <option>Staging</option>
                          <option>Development</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          defaultValue={field.value}
                          className="w-full rounded-md px-3 py-1.5 text-xs outline-none"
                          style={{ border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF', color: '#334155', fontFamily: 'monospace' }}
                          onFocus={e => e.target.style.borderColor = '#2563EB'}
                          onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={testConnection}
                  disabled={testingConn}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: testingConn ? '#93C5FD' : '#2563EB', color: '#FFFFFF', cursor: testingConn ? 'not-allowed' : 'pointer' }}
                >
                  {testingConn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  {testingConn ? 'Testing…' : 'Test Connection'}
                </button>
                {connResult === 'ok' && (
                  <span className="flex items-center gap-1.5 text-xs" style={{ color: '#16A34A' }}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Connection successful — latency 4ms
                  </span>
                )}
                <div className="ml-auto text-xs" style={{ color: '#94A3B8' }}>
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  Passwords are stored encrypted and never displayed in plaintext.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}