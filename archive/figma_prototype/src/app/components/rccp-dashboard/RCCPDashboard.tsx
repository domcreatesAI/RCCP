import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import {
  AlertTriangle, TrendingDown, Activity, ChevronDown,
  ChevronUp, Bot, Info, Zap, Sparkles, Users,
  Calendar, CalendarDays, Layers,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type HorizonView = '12m' | '12w' | '4w';
type RiskStatus = 'Critical' | 'High' | 'Watch' | 'Stable';

interface CapacityPoint {
  period: string;
  available: number;  // effective capacity hours (gross available × OEE 55%)
  firm: number;       // YPAC — released/firmed production orders
  forecast: number;   // LA — MRP demand (forecast)
  launch?: boolean;
}

interface LineRisk {
  line: string;
  plant: string;
  pool: string;
  status: RiskStatus;
  available: number;    // effective hours (OEE 55% applied) — 12-month total
  firm: number;         // YPAC hours — 12-month total
  forecast: number;     // LA hours — 12-month total
  required: number;     // firm + forecast
  gap: number;
  gapPct: number;
  labourStatus: string;
  riskScore: number;
  driver: string;
}

// ─── 12-Month Aggregate Data (OEE = 55%) ──────────────────────────────────────
// Effective capacity = gross available × 0.55 OEE
// Required = demand_qty × std_hrs/unit (YPAC firm + LA forecast)
// Aggregate across all 14 lines
const monthlyData: CapacityPoint[] = [
  { period: "Jan '26", available: 2380, firm: 880,  forecast: 780,  launch: false },
  { period: "Feb '26", available: 2380, firm: 920,  forecast: 840,  launch: false },
  { period: "Mar '26", available: 2380, firm: 980,  forecast: 1320, launch: true  }, // A-Range launch begins
  { period: "Apr '26", available: 2140, firm: 1020, forecast: 1580, launch: true  }, // Peak — maintenance window eats into available
  { period: "May '26", available: 2380, firm: 980,  forecast: 1480, launch: true  },
  { period: "Jun '26", available: 2380, firm: 900,  forecast: 1020, launch: false },
  { period: "Jul '26", available: 2140, firm: 820,  forecast: 860,  launch: false }, // Holiday period
  { period: "Aug '26", available: 2380, firm: 760,  forecast: 780,  launch: false },
  { period: "Sep '26", available: 2380, firm: 880,  forecast: 920,  launch: false },
  { period: "Oct '26", available: 2380, firm: 980,  forecast: 1020, launch: false },
  { period: "Nov '26", available: 2380, firm: 1060, forecast: 1080, launch: false },
  { period: "Dec '26", available: 1900, firm: 840,  forecast: 880,  launch: false }, // Xmas shutdown
];

// ─── 12-Week Zoom Data ─────────────────────────────────────────────────────────
const weeklyData12: CapacityPoint[] = [
  { period: 'W10', available: 540, firm: 188, forecast: 192 },
  { period: 'W11', available: 540, firm: 196, forecast: 210 },
  { period: 'W12', available: 484, firm: 204, forecast: 248, launch: true  },
  { period: 'W13', available: 540, firm: 218, forecast: 322, launch: true  },
  { period: 'W14', available: 540, firm: 226, forecast: 298, launch: true  },
  { period: 'W15', available: 540, firm: 214, forecast: 274 },
  { period: 'W16', available: 540, firm: 198, forecast: 240 },
  { period: 'W17', available: 484, firm: 182, forecast: 198 },
  { period: 'W18', available: 540, firm: 178, forecast: 186 },
  { period: 'W19', available: 540, firm: 192, forecast: 210 },
  { period: 'W20', available: 540, firm: 208, forecast: 224 },
  { period: 'W21', available: 540, firm: 214, forecast: 230 },
];

// ─── 4-Week Near-Term Data ─────────────────────────────────────────────────────
const weeklyData4: CapacityPoint[] = weeklyData12.slice(0, 4);

// ─── Per-Line 12-Month Totals (OEE = 55%) ─────────────────────────────────────
// effective_hrs = shift_hrs_per_day × working_days × 0.55
// 2-shift (14h/day): 14 × 250 × 0.55 = 1925h/yr
// 3-shift (21h/day): 21 × 250 × 0.55 = 2888h/yr  (A2xx critical lines)
// 1-shift  (7h/day):  7 × 250 × 0.55 =  963h/yr  (A401 specialist)
const allLines: LineRisk[] = [
  // ── Critical ──
  { line: 'A201', plant: 'A2', pool: 'LP-A2', status: 'Critical', available: 2888, firm: 1240, forecast: 1880, required: 3120, gap: -232, gapPct: -8.0,  labourStatus: 'Shortage', riskScore: 95, driver: 'A-Range launch surge + OEE deficit' },
  { line: 'A202', plant: 'A2', pool: 'LP-A2', status: 'Critical', available: 2888, firm: 1200, forecast: 1860, required: 3060, gap: -172, gapPct: -6.0,  labourStatus: 'Shortage', riskScore: 88, driver: 'A-Range launch (shared pool — LP-A2 at limit)' },
  { line: 'A304', plant: 'A3', pool: 'LP-A3', status: 'Critical', available: 2888, firm: 1440, forecast: 2040, required: 3480, gap: -592, gapPct: -20.5, labourStatus: 'Critical', riskScore: 100, driver: 'D-Range launch + Apr maintenance conflict' },
  { line: 'A305', plant: 'A3', pool: 'LP-A3', status: 'Critical', available: 2888, firm: 1320, forecast: 1860, required: 3180, gap: -292, gapPct: -10.1, labourStatus: 'Shortage', riskScore: 82, driver: 'D-Range launch volume uplift' },
  // ── High ──
  { line: 'A302', plant: 'A3', pool: 'LP-A3', status: 'High',     available: 1925, firm: 940,  forecast: 1270, required: 2210, gap: -285, gapPct: -14.8, labourStatus: 'Adequate', riskScore: 74, driver: 'OEE below target — C-Range premium line' },
  { line: 'A303', plant: 'A3', pool: 'LP-A3', status: 'High',     available: 1925, firm: 880,  forecast: 1200, required: 2080, gap: -155, gapPct:  -8.1, labourStatus: 'Adequate', riskScore: 66, driver: 'Demand forecast uplift +18% (H2 revision)' },
  { line: 'A101', plant: 'A1', pool: 'LP-A1', status: 'High',     available: 1925, firm: 920,  forecast: 1140, required: 2060, gap: -135, gapPct:  -7.0, labourStatus: 'Adequate', riskScore: 62, driver: 'OEE at 55% baseline — no headroom vs B-Range demand' },
  // ── Watch ──
  { line: 'A102', plant: 'A1', pool: 'LP-A1', status: 'Watch',    available: 1925, firm: 820,  forecast: 1020, required: 1840, gap:  85,  gapPct:   4.4, labourStatus: 'Adequate', riskScore: 38, driver: 'B-Range seasonal uplift H2 — margin thin' },
  { line: 'A307', plant: 'A3', pool: 'LP-A3', status: 'Watch',    available: 1925, firm: 800,  forecast: 1040, required: 1840, gap:  85,  gapPct:   4.4, labourStatus: 'Adequate', riskScore: 34, driver: 'Seasonal demand increase — pool scheduling risk' },
  { line: 'A401', plant: 'A4', pool: 'LP-A4', status: 'Watch',    available:  963, firm: 420,  forecast:  540, required:  960, gap:   3,  gapPct:   0.3, labourStatus: 'Adequate', riskScore: 30, driver: 'E-Range specialist — near capacity all year' },
  // ── Stable ──
  { line: 'A103', plant: 'A1', pool: 'LP-A1', status: 'Stable',   available: 1925, firm: 680,  forecast:  880, required: 1560, gap: 365,  gapPct:  19.0, labourStatus: 'Adequate', riskScore: 12, driver: '—' },
  { line: 'A308', plant: 'A3', pool: 'LP-A3', status: 'Stable',   available: 1925, firm: 700,  forecast:  920, required: 1620, gap: 305,  gapPct:  15.8, labourStatus: 'Adequate', riskScore: 15, driver: '—' },
  { line: 'A501', plant: 'A5', pool: 'LP-A5', status: 'Stable',   available: 1925, firm: 640,  forecast:  840, required: 1480, gap: 445,  gapPct:  23.1, labourStatus: 'Adequate', riskScore: 8,  driver: '—' },
  { line: 'A502', plant: 'A5', pool: 'LP-A5', status: 'Stable',   available: 1925, firm: 620,  forecast:  800, required: 1420, gap: 505,  gapPct:  26.2, labourStatus: 'Adequate', riskScore: 6,  driver: '—' },
];

const constraintDrivers = [
  { rank: 1, driver: 'A-Range & D-Range Product Launch', lines: ['A201', 'A202', 'A304', 'A305'], impact: '−1,288h aggregate deficit (Mar–Jun)', category: 'Launch' },
  { rank: 2, driver: 'OEE Baseline 55% — No Headroom',  lines: ['A101', 'A302'],                  impact: '−420h vs theoretical maximum at higher OEE', category: 'OEE' },
  { rank: 3, driver: 'Planned Maintenance Conflict',     lines: ['A304'],                          impact: 'Apr window conflicts with peak launch window',  category: 'Maintenance' },
  { rank: 4, driver: 'Plant A3 Labour Pool Constraint',  lines: ['A302','A303','A304','A305','A307','A308'], impact: 'Max 4 of 6 A3 lines can run simultaneously', category: 'Labour' },
];

const aiRecs = [
  { priority: 'Critical', rec: 'Raise emergency staffing request for A304 and A305 — minimum 6 FTE for Mar–May to address compounded D-Range launch gap. LP-A3 pool is also at max concurrent capacity.', impact: '−560h gap reduction estimated', score: 100 },
  { priority: 'Critical', rec: 'Reschedule A304 planned maintenance from April to August. Moving the window out of launch peak recovers approximately 280h of critical capacity.', impact: '−280h recovered on A304', score: 92 },
  { priority: 'High',     rec: 'Apply OEE improvement programme on A101 and A302. Even a +5pp OEE improvement (55% → 60%) on these two lines adds ~190 effective hours to the annual plan.', impact: '+190h added effective capacity', score: 76 },
  { priority: 'Watch',    rec: 'Consider rotating A307 into the Q3 schedule and resting A303. Pool LP-A3 has headroom in H2 — use time-phased scheduling to smooth demand across lines.', impact: 'Reduces peak pool stress by est. 14%', score: 52 },
];

// ─── Style Helpers ─────────────────────────────────────────────────────────────
function riskStyle(status: RiskStatus) {
  const map = {
    Critical: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5', dot: '#EF4444' },
    High:     { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74', dot: '#F97316' },
    Watch:    { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D', dot: '#EAB308' },
    Stable:   { bg: '#F0FDF4', text: '#14532D', border: '#86EFAC', dot: '#22C55E' },
  };
  return map[status];
}

function priorityStyle(p: string) {
  if (p === 'Critical') return { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' };
  if (p === 'High')     return { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' };
  return { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' };
}

// ─── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const avail    = payload.find((p: any) => p.dataKey === 'available')?.value ?? 0;
  const firm     = payload.find((p: any) => p.dataKey === 'firm')?.value ?? 0;
  const forecast = payload.find((p: any) => p.dataKey === 'forecast')?.value ?? 0;
  const total    = firm + forecast;
  const gap      = avail - total;
  return (
    <div className="rounded-xl shadow-lg border bg-white p-3 text-xs min-w-[180px]" style={{ borderColor: '#E2E8F0' }}>
      <div className="font-bold text-gray-900 mb-2">{label}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-gray-300" /><span className="text-gray-600">Effective Capacity</span></div>
          <span className="font-bold tabular-nums text-gray-900">{avail.toLocaleString()}h</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-700" /><span className="text-gray-600">Firm (YPAC)</span></div>
          <span className="font-semibold tabular-nums text-indigo-800">{firm.toLocaleString()}h</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-400" /><span className="text-gray-600">Forecast (LA)</span></div>
          <span className="font-semibold tabular-nums text-indigo-600">{forecast.toLocaleString()}h</span>
        </div>
        <div className="border-t border-gray-100 pt-1.5 flex items-center justify-between gap-4">
          <span className="text-gray-600">Total Required</span>
          <span className="font-bold tabular-nums">{total.toLocaleString()}h</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-600">Gap</span>
          <span className={`font-bold tabular-nums ${gap >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {gap >= 0 ? '+' : ''}{gap.toLocaleString()}h
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Labour Pool Summary ───────────────────────────────────────────────────────
const labourPools = [
  { id: 'LP-A1', plant: 'A1', lines: ['A101', 'A102', 'A103'],                             maxConcurrent: 3, note: 'All 3 lines can run simultaneously' },
  { id: 'LP-A2', plant: 'A2', lines: ['A201', 'A202'],                                     maxConcurrent: 2, note: 'Both lines can run simultaneously' },
  { id: 'LP-A3', plant: 'A3', lines: ['A302','A303','A304','A305','A307','A308'],           maxConcurrent: 4, note: '⚠ Physical constraint: max 4 of 6 lines simultaneous' },
  { id: 'LP-A4', plant: 'A4', lines: ['A401'],                                             maxConcurrent: 1, note: 'Single specialist line' },
  { id: 'LP-A5', plant: 'A5', lines: ['A501', 'A502'],                                     maxConcurrent: 2, note: 'Both lines can run simultaneously' },
];

// ─── Main Component ─────────────────────────────────────────────────────────────
export function RCCPDashboard() {
  const [horizon, setHorizon] = useState<HorizonView>('12m');
  const [showAI, setShowAI] = useState(true);
  const [expandedDriver, setExpandedDriver] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<RiskStatus | 'All'>('All');
  const [showLabourPools, setShowLabourPools] = useState(true);

  // Horizon toggle data
  const chartData = horizon === '12m' ? monthlyData : horizon === '12w' ? weeklyData12 : weeklyData4;

  // KPIs (12-month view)
  const criticalLines  = allLines.filter(l => l.status === 'Critical').length;
  const highLines      = allLines.filter(l => l.status === 'High').length;
  const totalGap       = allLines.reduce((s, l) => s + Math.min(l.gap, 0), 0);
  const totalAvail     = allLines.reduce((s, l) => s + l.available, 0);
  const totalRequired  = allLines.reduce((s, l) => s + l.required, 0);
  const overallUtil    = Math.round((totalRequired / totalAvail) * 100);
  const peakMonthUtil  = Math.round(((monthlyData[3].firm + monthlyData[3].forecast) / monthlyData[3].available) * 100);

  const displayLines = filterStatus === 'All' ? allLines : allLines.filter(l => l.status === filterStatus);

  // Determine if a chart bar is overloaded
  const getBarStatus = (d: CapacityPoint) => {
    const total = d.firm + d.forecast;
    if (total > d.available) return 'overload';
    if (total > d.available * 0.9) return 'tight';
    return 'ok';
  };

  const horizonLabel = horizon === '12m' ? '12-Month Rolling View — Jan–Dec 2026' : horizon === '12w' ? '12-Week Near-Term View' : '4-Week Operational View';
  const horizonNote  = horizon === '12m' ? 'Monthly buckets · demand stored monthly, weekly derived at query time · OEE 55%' : 'Weekly buckets derived from monthly demand plan';

  return (
    <div className="p-6 space-y-5 min-h-0">

      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">RCCP Dashboard</h1>
          <p className="text-sm mt-0.5 text-gray-500">
            Rough Cut Capacity Planning — 14 filling lines · Gravesend UKP1 · OEE baseline 55% · {horizon === '12m' ? 'Jan–Dec 2026' : 'Near-term zoom'}
          </p>
        </div>
        {/* Horizon Toggle */}
        <div className="flex items-center bg-white rounded-xl border border-gray-200 p-1 shadow-sm shrink-0">
          {[
            { key: '12m' as HorizonView, icon: Calendar, label: '12 Months' },
            { key: '12w' as HorizonView, icon: CalendarDays, label: '12 Weeks' },
            { key: '4w'  as HorizonView, icon: Layers, label: '4 Weeks' },
          ].map(({ key, icon: Icon, label }) => (
            <motion.button key={key} onClick={() => setHorizon(key)}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                backgroundColor: horizon === key ? '#4F46E5' : 'transparent',
                color: horizon === key ? '#FFFFFF' : '#64748B',
                boxShadow: horizon === key ? '0 2px 8px rgba(79,70,229,0.3)' : 'none',
              }}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* ── KPI Tiles ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Critical Lines',  value: criticalLines,          unit: 'lines', icon: AlertTriangle, gradient: 'from-red-500 to-rose-600',  sub: `${highLines} high risk, ${allLines.filter(l=>l.status==='Watch').length} watch` },
          { label: 'Overall Utilisation', value: `${overallUtil}%`, unit: '',      icon: Activity,      gradient: 'from-indigo-500 to-purple-600', sub: `Peak month ${peakMonthUtil}% (Apr '26)` },
          { label: 'Total Annual Gap', value: `${Math.abs(Math.round(totalGap/1000*10)/10)}k`, unit: 'h', icon: TrendingDown, gradient: 'from-orange-500 to-amber-600', sub: 'Effective hours deficit across overloaded lines' },
          { label: 'OEE Baseline',    value: '55%',                  unit: 'OEE',  icon: Zap,           gradient: 'from-violet-500 to-indigo-600', sub: 'Configurable per line · target uplift in Scenarios' },
        ].map((kpi, i) => (
          <motion.div key={kpi.label}
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
            className="bg-white rounded-2xl border border-gray-200 p-4 relative overflow-hidden"
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="absolute inset-0 opacity-[0.03] rounded-2xl" style={{ background: `linear-gradient(135deg, ${kpi.gradient.split(' ')[1].replace('from-','#').replace('-500','').replace('-600','')}, transparent)` }} />
            <div className="flex items-start justify-between mb-2">
              <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                <kpi.icon className="w-4 h-4 text-white" />
              </div>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-black text-gray-900 tabular-nums">{kpi.value}</span>
              {kpi.unit && <span className="text-sm text-gray-500 mb-0.5">{kpi.unit}</span>}
            </div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">{kpi.label}</div>
            <div className="text-xs text-gray-400 mt-1 leading-tight">{kpi.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Capacity Chart ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-200 p-5"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-sm font-bold text-gray-900">{horizonLabel}</div>
            <div className="text-xs text-gray-400 mt-0.5">{horizonNote}</div>
          </div>
          <div className="flex items-center gap-4 text-xs shrink-0 flex-wrap justify-end">
            <div className="flex items-center gap-1.5"><div className="w-6 h-0 border-t-2 border-dashed border-slate-500" /><span className="text-gray-500">Effective Capacity (OEE 55%)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-900" /><span className="text-gray-500">Firm Orders (YPAC)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-400" /><span className="text-gray-500">Forecast Demand (LA)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400" /><span className="text-gray-500">Overload</span></div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={horizon}
            initial={{ opacity: 0, x: horizon === '12m' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barSize={horizon === '12m' ? 28 : 20} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94A3B8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
                <Tooltip content={<CustomTooltip />} />

                {/* Firm orders (YPAC) — stacked bottom */}
                <Bar dataKey="firm" name="Firm (YPAC)" stackId="demand" fill="#3730A3" radius={[0, 0, 3, 3]} isAnimationActive={true} animationDuration={600} />

                {/* Forecast demand (LA) — stacked on firm, color reflects load status */}
                <Bar dataKey="forecast" name="Forecast (LA)" stackId="demand" radius={[3, 3, 0, 0]} isAnimationActive={true} animationDuration={700}>
                  {chartData.map((entry, index) => {
                    const st = getBarStatus(entry);
                    return <Cell key={`cell-${index}`} fill={st === 'overload' ? '#F87171' : st === 'tight' ? '#FB923C' : '#818CF8'} />;
                  })}
                </Bar>

                {/* Available capacity — shown as a step line (the constraint ceiling) */}
                <Line dataKey="available" type="step" stroke="#64748B" strokeWidth={2.5}
                  dot={false} strokeDasharray="6 3" name="Effective Capacity" isAnimationActive={true} animationDuration={800} />

                {/* Launch month labels */}
                {chartData.filter(e => e.launch).map((entry, i) => (
                  <ReferenceLine key={`launch-${i}`} x={entry.period}
                    stroke="#F59E0B" strokeWidth={1} strokeDasharray="3 4"
                    label={{ value: '▲', position: 'top', fontSize: 10, fill: '#D97706' }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>

        {/* OEE Note */}
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Effective capacity = gross available hours × OEE 55% (site baseline). Red bars = firm + forecast exceeds effective capacity. Configure OEE per line in Settings → OEE Targets.</span>
        </div>
      </motion.div>

      {/* ── Constraint Drivers + AI Recommendations ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Constraint Drivers */}
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-3.5 border-b border-gray-100"
            style={{ background: 'linear-gradient(to right, #FFF7ED, white)' }}>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-orange-500" />
              <div className="text-sm font-bold text-gray-900">Top Constraint Drivers</div>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Primary causes of capacity risk this planning cycle</div>
          </div>
          <div className="divide-y divide-gray-100">
            {constraintDrivers.map((d, i) => {
              const isExp = expandedDriver === d.rank;
              const catColors: Record<string, string> = { Launch: '#7C3AED', OEE: '#0891B2', Maintenance: '#D97706', Labour: '#DC2626' };
              return (
                <motion.div key={d.rank} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }}>
                  <button onClick={() => setExpandedDriver(isExp ? null : d.rank)}
                    className="w-full px-5 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 mt-0.5"
                      style={{ backgroundColor: catColors[d.category] ?? '#6B7280', fontSize: 10 }}>
                      {d.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-800">{d.driver}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                          style={{ backgroundColor: `${catColors[d.category]}18`, color: catColors[d.category] ?? '#6B7280' }}>
                          {d.category}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{d.impact}</div>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 mt-0.5"
                      style={{ transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  <AnimatePresence>
                    {isExp && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden">
                        <div className="px-5 pb-3 ml-8">
                          <div className="flex flex-wrap gap-1">
                            {d.lines.map(l => (
                              <span key={l} className="font-mono text-xs px-2 py-0.5 rounded-md font-semibold"
                                style={{ backgroundColor: catColors[d.category] + '18', color: catColors[d.category] }}>
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* AI Recommendations */}
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div className="px-5 py-3.5 border-b border-gray-100"
            style={{ background: 'linear-gradient(to right, #F5F3FF, white)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)' }}>
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="text-sm font-bold text-gray-900">RCCP Recommendations</div>
              </div>
              <button onClick={() => setShowAI(!showAI)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold transition-colors">
                {showAI ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">Prioritised interventions to close the capacity gap</div>
          </div>
          <AnimatePresence>
            {showAI && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="divide-y divide-gray-100">
                {aiRecs.map((r, i) => {
                  const s = priorityStyle(r.priority);
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.06 }}
                      className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#7C3AED' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                              style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                              {r.priority}
                            </span>
                            <span className="text-xs text-emerald-700 font-semibold">{r.impact}</span>
                          </div>
                          <p className="text-xs text-gray-600 leading-relaxed">{r.rec}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Labour Pool Status ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <button onClick={() => setShowLabourPools(!showLabourPools)}
          className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-600" />
            <div className="text-sm font-bold text-gray-900">Labour Pool Status</div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
              LP-A3 constrained
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">5 pools · 14 lines</span>
            {showLabourPools ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </div>
        </button>
        <AnimatePresence>
          {showLabourPools && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
              className="overflow-hidden border-t border-gray-100">
              <div className="px-5 py-4 grid grid-cols-5 gap-3">
                {labourPools.map(pool => {
                  const isConstrained = pool.lines.length > pool.maxConcurrent;
                  const poolLines = allLines.filter(l => l.pool === pool.id);
                  const hasCritical = poolLines.some(l => l.status === 'Critical');
                  const hasHigh = poolLines.some(l => l.status === 'High');
                  return (
                    <div key={pool.id}
                      className="rounded-xl p-3 border"
                      style={{
                        borderColor: hasCritical ? '#FCA5A5' : hasHigh ? '#FDBA74' : isConstrained ? '#DDD6FE' : '#E2E8F0',
                        backgroundColor: hasCritical ? '#FEF2F2' : hasHigh ? '#FFF7ED' : isConstrained ? '#F5F3FF' : '#F8FAFC',
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-gray-900">{pool.id}</span>
                        {isConstrained && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700" style={{ fontSize: 9 }}>
                            {pool.maxConcurrent}/{pool.lines.length} max
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {pool.lines.map(line => {
                          const lr = allLines.find(l => l.line === line);
                          const s = lr ? riskStyle(lr.status) : { bg: '#F8FAFC', text: '#64748B', dot: '#CBD5E1' };
                          return (
                            <span key={line} className="font-mono text-xs px-1.5 py-0.5 rounded font-semibold"
                              style={{ backgroundColor: s.bg, color: s.text, fontSize: 10 }}>
                              {line}
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-xs text-gray-500 leading-tight" style={{ fontSize: 10 }}>{pool.note}</div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-3 text-xs text-gray-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0" />
                LP-A3 has 6 lines but physical space and crew limits allow max 4 to run simultaneously. Use Scenarios → Labour Pool Scheduling to assign lines to time periods.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Line Risk Table ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between"
          style={{ background: 'linear-gradient(to right, #F8FAFC, white)' }}>
          <div>
            <div className="text-sm font-bold text-gray-900">Line-by-Line Risk Assessment</div>
            <div className="text-xs text-gray-400 mt-0.5">12-month aggregate · effective capacity = gross × OEE 55% · required = demand × std hrs/unit</div>
          </div>
          {/* Filter Buttons */}
          <div className="flex items-center gap-1">
            {(['All', 'Critical', 'High', 'Watch', 'Stable'] as const).map(s => {
              const style = s === 'All' ? { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' }
                : s === 'Critical' ? { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5' }
                : s === 'High'     ? { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74' }
                : s === 'Watch'    ? { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' }
                : { bg: '#F0FDF4', text: '#14532D', border: '#86EFAC' };
              return (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all"
                  style={{
                    backgroundColor: filterStatus === s ? style.bg : 'transparent',
                    color: filterStatus === s ? style.text : '#94A3B8',
                    borderColor: filterStatus === s ? style.border : 'transparent',
                  }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead style={{ backgroundColor: '#F8FAFC' }}>
              <tr>
                {['Line', 'Pool', 'Status', 'Eff. Capacity', 'Firm (YPAC)', 'Forecast (LA)', 'Total Required', 'Gap (h)', 'Gap %', 'Labour', 'Risk Score', 'Primary Driver'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayLines.map((l, i) => {
                const s = riskStyle(l.status);
                const pool = labourPools.find(p => p.id === l.pool);
                return (
                  <motion.tr key={l.line}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    className="border-b last:border-0 hover:bg-gray-50 transition-colors" style={{ borderColor: '#F1F5F9' }}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-black text-gray-900">{l.line}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-gray-500">{l.pool}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-gray-700 font-semibold">{l.available.toLocaleString()}h</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-indigo-800 font-semibold">{l.firm.toLocaleString()}h</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-indigo-500 font-semibold">{l.forecast.toLocaleString()}h</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-gray-700 font-semibold">{l.required.toLocaleString()}h</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-black tabular-nums" style={{ color: l.gap >= 0 ? '#15803D' : '#991B1B' }}>
                        {l.gap >= 0 ? '+' : ''}{l.gap.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-bold tabular-nums" style={{ color: l.gapPct >= 0 ? '#15803D' : '#991B1B' }}>
                        {l.gapPct >= 0 ? '+' : ''}{l.gapPct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold"
                        style={{ color: l.labourStatus === 'Adequate' ? '#15803D' : l.labourStatus === 'Shortage' ? '#D97706' : '#991B1B' }}>
                        {l.labourStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" style={{ minWidth: 100 }}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" style={{ minWidth: 48 }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${l.riskScore}%` }} transition={{ delay: i * 0.04 + 0.4, duration: 0.5 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: l.riskScore >= 80 ? '#EF4444' : l.riskScore >= 60 ? '#F97316' : l.riskScore >= 30 ? '#EAB308' : '#22C55E' }} />
                        </div>
                        <span className="text-xs font-black tabular-nums text-gray-700" style={{ minWidth: 24 }}>{l.riskScore}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-xs">{l.driver}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-1.5 text-xs text-gray-400">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Effective capacity = available_mins_per_day × OEE (0.55) × working_days. Required = Σ (demand_qty × std_hrs_per_unit) per item group per line. Firm = YPAC released orders. Forecast = LA MRP proposals.
        </div>
      </motion.div>
    </div>
  );
}