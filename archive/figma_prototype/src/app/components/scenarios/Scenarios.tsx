import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Bot, AlertTriangle, DollarSign, Shield, Users,
  Check, ArrowRight, ChevronDown,
  Clock, Zap, Sparkles, Lock, Target,
  GitBranch, Shuffle, UserPlus, TrendingUp, Activity,
  Plus, Info, BarChart3, Calendar, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────
type RiskStatus = 'Critical' | 'High' | 'Watch' | 'Stable';

interface BaselineLine {
  line: string;
  available: number;
  baseStatus: RiskStatus;
  baseGap: number;
  baseScore: number;
  baseOee: number;
  driver: string;
}
interface ScenarioLine extends BaselineLine {
  scenGap: number;
  scenScore: number;
  scenStatus: RiskStatus;
}
interface LineControl {
  extraHours: number;   // 0–400h, step 40
  tempOps: number;      // 0–6
  oeeBoost: number;     // 0–12 pp above base OEE
}
type TransferMatrix = Record<string, Record<string, number>>; // [fromLine][toLine] = count

const DEFAULT_CTRL: LineControl = { extraHours: 0, tempOps: 0, oeeBoost: 0 };

// ─── Data ───────────────────────────────────────────────────────────────────────
// Baseline: 12-month totals · effective capacity = gross × OEE 55%
// 2-shift (14h/day): 14×250×0.55 = 1925h/yr
// 3-shift (21h/day): 21×250×0.55 = 2888h/yr  (A2xx/A304/A305 — high-demand lines)
// 1-shift  (7h/day):  7×250×0.55 =  963h/yr  (A401 specialist)
const baselineLines: BaselineLine[] = [
  { line: 'A101', available: 1925, baseStatus: 'High',     baseGap: -135,  baseScore: 62,  baseOee: 55, driver: 'OEE at 55% baseline — no headroom vs B-Range demand' },
  { line: 'A102', available: 1925, baseStatus: 'Watch',    baseGap:  85,   baseScore: 38,  baseOee: 55, driver: 'B-Range seasonal uplift H2 — margin thin' },
  { line: 'A103', available: 1925, baseStatus: 'Stable',   baseGap:  365,  baseScore: 12,  baseOee: 55, driver: '—' },
  { line: 'A201', available: 2888, baseStatus: 'Critical', baseGap: -232,  baseScore: 95,  baseOee: 55, driver: 'A-Range launch surge + OEE deficit' },
  { line: 'A202', available: 2888, baseStatus: 'Critical', baseGap: -172,  baseScore: 88,  baseOee: 55, driver: 'A-Range launch (shared LP-A2 pool at capacity)' },
  { line: 'A302', available: 1925, baseStatus: 'High',     baseGap: -285,  baseScore: 74,  baseOee: 55, driver: 'OEE at 55% — C-Range premium · LP-A3 pool scheduling risk' },
  { line: 'A303', available: 1925, baseStatus: 'High',     baseGap: -155,  baseScore: 66,  baseOee: 55, driver: 'Demand forecast uplift +18% (H2 revision)' },
  { line: 'A304', available: 2888, baseStatus: 'Critical', baseGap: -592,  baseScore: 100, baseOee: 55, driver: 'D-Range launch + Apr maintenance conflict · LP-A3' },
  { line: 'A305', available: 2888, baseStatus: 'Critical', baseGap: -292,  baseScore: 82,  baseOee: 55, driver: 'D-Range launch volume uplift · LP-A3' },
  { line: 'A307', available: 1925, baseStatus: 'Watch',    baseGap:  85,   baseScore: 34,  baseOee: 55, driver: 'Seasonal demand increase — pool scheduling risk LP-A3' },
  { line: 'A308', available: 1925, baseStatus: 'Stable',   baseGap:  305,  baseScore: 15,  baseOee: 55, driver: '—' },
  { line: 'A401', available:  963, baseStatus: 'Watch',    baseGap:  -17,  baseScore: 30,  baseOee: 55, driver: 'E-Range specialist — near capacity all year' },
  { line: 'A501', available: 1925, baseStatus: 'Stable',   baseGap:  445,  baseScore: 8,   baseOee: 55, driver: '—' },
  { line: 'A502', available: 1925, baseStatus: 'Stable',   baseGap:  505,  baseScore: 6,   baseOee: 55, driver: '—' },
];

const DONOR_MAX_OPS: Record<string, number> = { A103: 3, A308: 1, A501: 2, A502: 1 };
const DONOR_LINES = ['A103', 'A308', 'A501', 'A502'];
const RECIPIENT_LINES = ['A201', 'A202', 'A304', 'A305', 'A101', 'A302', 'A303'];

// ─── Labour Pool A3 Data ───────────────────────────────────────────────────────
const POOL_A3_LINES = ['A302', 'A303', 'A304', 'A305', 'A307', 'A308'];
const POOL_A3_MAX = 4; // physical constraint: max 4 of 6 lines simultaneously
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LAUNCH_MONTHS = [2, 3, 4]; // Mar, Apr, May (0-indexed)

// Initial schedule: 4 lines active per month (at max constraint), rotated by demand
//        J     F     M(L)  A(L)  M(L)  J     J     A     S     O     N     D
const initialPoolSchedule: Record<string, boolean[]> = {
  A302: [true,  true,  true,  true,  true,  true,  true,  true,  true,  true,  false, false],
  A303: [true,  true,  true,  true,  true,  true,  true,  true,  true,  false, false, true ],
  A304: [false, false, true,  true,  true,  false, false, false, false, true,  true,  false],
  A305: [false, false, true,  true,  true,  false, false, false, false, true,  true,  false],
  A307: [true,  true,  false, false, false, true,  true,  false, true,  true,  true,  true ],
  A308: [true,  true,  false, false, false, true,  false, true,  true,  false, true,  false],
};

// ─── Style Helpers ──────────────────────────────────────────────────────────────
function riskStyle(s: RiskStatus) {
  return {
    Critical: { text: '#991B1B', border: '#FECACA', badge: '#FEF2F2', badgeText: '#991B1B', dot: '#EF4444', bar: '#EF4444', bgCard: 'rgba(255,241,242,0.6)' },
    High:     { text: '#9A3412', border: '#FED7AA', badge: '#FFF7ED', badgeText: '#9A3412', dot: '#F97316', bar: '#F97316', bgCard: 'rgba(255,247,237,0.6)' },
    Watch:    { text: '#92400E', border: '#FDE68A', badge: '#FFFBEB', badgeText: '#92400E', dot: '#F59E0B', bar: '#F59E0B', bgCard: 'rgba(255,251,235,0.6)' },
    Stable:   { text: '#14532D', border: '#86EFAC', badge: '#F0FDF4', badgeText: '#14532D', dot: '#22C55E', bar: '#22C55E', bgCard: 'rgba(240,253,244,0.6)' },
  }[s];
}

// ─── Scenario Computation ───────────────────────────────────────────────────────
function computeScenario(
  lineControls: Record<string, LineControl>,
  transfers: TransferMatrix,
  globalOee: number,
  launchReduction: number,
): ScenarioLine[] {
  const opsReceived: Record<string, number> = {};
  const opsSent: Record<string, number> = {};
  Object.entries(transfers).forEach(([from, targets]) => {
    Object.entries(targets).forEach(([to, count]) => {
      opsReceived[to] = (opsReceived[to] || 0) + count;
      opsSent[from] = (opsSent[from] || 0) + count;
    });
  });

  return baselineLines.map(l => {
    const ctrl = lineControls[l.line] ?? DEFAULT_CTRL;
    const received = opsReceived[l.line] || 0;
    const sent = opsSent[l.line] || 0;
    let gap = l.baseGap;

    gap += ctrl.extraHours;
    gap += ctrl.tempOps * 260;      // ~260h per operator over the planning window
    gap += received * 260;
    gap -= sent * 260;

    if (ctrl.oeeBoost > 0) {
      // OEE 55% baseline: additional hours = gross_available × (boost/100)
      // gross_available = available / 0.55
      gap += Math.round((l.available / 0.55) * (ctrl.oeeBoost / 100));
    } else if ((l.line === 'A101' || l.line === 'A302') && globalOee > 55) {
      // Global OEE lever improvement above 55% baseline
      gap += Math.round((l.available / 0.55) * ((globalOee - 55) / 100));
    }

    if (['A201', 'A202', 'A304', 'A305'].includes(l.line) && launchReduction > 0) {
      gap += Math.round(launchReduction * 55);
    }

    const improvement = gap - l.baseGap;
    const newScore = Math.max(0, Math.min(100, l.baseScore - Math.max(0, improvement) / 15));
    const scenStatus: RiskStatus = newScore >= 90 ? 'Critical' : newScore >= 60 ? 'High' : newScore >= 30 ? 'Watch' : 'Stable';
    return { ...l, scenGap: Math.round(gap), scenScore: Math.round(newScore), scenStatus };
  });
}

// ─── GapBar Component ───────────────────────────────────────────────────────────
function GapBar({ label, gap, maxGap, color }: { label: string; gap: number; maxGap: number; color: string }) {
  const pct = Math.min(100, (Math.abs(gap) / Math.abs(maxGap)) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-right text-xs shrink-0" style={{ color: gap < 0 ? '#DC2626' : '#16A34A' }}>
        {gap > 0 ? '+' : ''}{gap.toLocaleString()}h
      </span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ backgroundColor: gap < 0 ? color : '#22C55E' }}
        />
      </div>
      <span className="text-xs text-gray-400 w-12 shrink-0">{label}</span>
    </div>
  );
}

// ─── LineCard Component ─────────────────────────────────────────────────────────
interface LineCardProps {
  baseline: BaselineLine;
  scen: ScenarioLine;
  ctrl: LineControl;
  onUpdate: (u: Partial<LineControl>) => void;
  mode: 'recipient' | 'donor' | 'watch';
  opsReceived: number;
}
function LineCard({ baseline, scen, ctrl, onUpdate, mode, opsReceived }: LineCardProps) {
  const [expanded, setExpanded] = useState(mode === 'recipient' && baseline.baseStatus === 'Critical');
  const style = riskStyle(baseline.baseStatus);
  const isModified = ctrl.extraHours > 0 || ctrl.tempOps > 0 || ctrl.oeeBoost > 0 || opsReceived > 0;
  const gapDelta = scen.scenGap - baseline.baseGap;
  const improved = gapDelta > 0;
  const maxGap = 1400;
  // Show OEE boost for non-stable lines (all lines are at 55% baseline — improvement is meaningful for stressed lines)
  const showOeeControl = baseline.baseStatus !== 'Stable';

  return (
    <motion.div
      layout
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-xl overflow-hidden border"
      style={{ borderColor: isModified ? '#6366F1' : style.border, borderWidth: isModified ? 1.5 : 1 }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left"
        style={{ background: isModified ? 'linear-gradient(to right, #EEF2FF, #F5F3FF)' : `linear-gradient(135deg, ${style.bgCard}, white)` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md shrink-0">{baseline.line}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold shrink-0" style={{ backgroundColor: style.badge, color: style.badgeText, border: `1px solid ${style.border}` }}>
            {baseline.baseStatus}
          </span>
          {isModified && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 shrink-0">
              Modified
            </motion.span>
          )}
          {opsReceived > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 shrink-0">
              +{opsReceived} transferred
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {gapDelta !== 0 && (
            <motion.span
              key={gapDelta}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: improved ? '#F0FDF4' : '#FEF2F2', color: improved ? '#16A34A' : '#DC2626' }}
            >
              {improved ? '↑' : '↓'} {Math.abs(gapDelta).toLocaleString()}h
            </motion.span>
          )}
          <ChevronDown
            className="w-3.5 h-3.5 text-gray-400 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>

      {/* Gap bars - always visible */}
      <div className="px-3.5 py-2 space-y-1.5 bg-gray-50/50 border-t border-gray-100">
        <GapBar label="Base" gap={baseline.baseGap} maxGap={maxGap} color={style.bar} />
        <GapBar label="Scen B" gap={scen.scenGap} maxGap={maxGap} color={scen.scenGap < 0 ? riskStyle(scen.scenStatus).bar : '#22C55E'} />
      </div>

      {/* Expandable Controls */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3.5 py-3 space-y-3 border-t border-gray-100">
              {/* Extra Hours */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-500" /> Extra Hours
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-indigo-700">{ctrl.extraHours}h</span>
                    {ctrl.extraHours > 0 && <span className="text-xs text-gray-400">£{(ctrl.extraHours * 80).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdate({ extraHours: Math.max(0, ctrl.extraHours - 40) })}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-xs shrink-0"
                  >−</button>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <motion.div animate={{ width: `${(ctrl.extraHours / 400) * 100}%` }} transition={{ duration: 0.3 }} className="h-full bg-indigo-500 rounded-full" />
                  </div>
                  <button
                    onClick={() => onUpdate({ extraHours: Math.min(400, ctrl.extraHours + 40) })}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors text-xs shrink-0"
                  >+</button>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">Max 400h · +{ctrl.extraHours}h capacity</div>
              </div>

              {/* Temp Operators */}
              {(mode === 'recipient') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <UserPlus className="w-3 h-3 text-violet-500" /> Temp Operators
                    </span>
                    {ctrl.tempOps > 0 && <span className="text-xs text-gray-400">£{(ctrl.tempOps * 8 * 280).toLocaleString()}/8wk</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdate({ tempOps: Math.max(0, ctrl.tempOps - 1) })}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors font-medium shrink-0"
                    >−</button>
                    <div className="flex-1 flex gap-1">
                      {[...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 h-5 rounded-sm cursor-pointer transition-all"
                          style={{ backgroundColor: i < ctrl.tempOps ? '#8B5CF6' : '#F3F4F6' }}
                          onClick={() => onUpdate({ tempOps: i < ctrl.tempOps ? i : i + 1 })}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => onUpdate({ tempOps: Math.min(6, ctrl.tempOps + 1) })}
                      className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors font-medium shrink-0"
                    >+</button>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{ctrl.tempOps} operators · +{ctrl.tempOps * 280}h capacity</div>
                </div>
              )}

              {/* OEE Boost — only for underperforming lines */}
              {showOeeControl && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <Target className="w-3 h-3 text-amber-500" /> OEE Target
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Current: {baseline.baseOee}%</span>
                      <ArrowRight className="w-2.5 h-2.5 text-gray-300" />
                      <span className="text-xs font-bold text-amber-700">{baseline.baseOee + ctrl.oeeBoost}%</span>
                    </div>
                  </div>
                  <input
                    type="range" min={0} max={12} step={1} value={ctrl.oeeBoost}
                    onChange={e => onUpdate({ oeeBoost: +e.target.value })}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#F59E0B' }}
                  />
                  <div className="text-xs text-gray-400 mt-0.5">+{Math.round(baseline.available * (ctrl.oeeBoost / 100) * 0.85)}h effective capacity gain</div>
                </div>
              )}

              {/* Status after scenario */}
              {(ctrl.extraHours > 0 || ctrl.tempOps > 0 || ctrl.oeeBoost > 0 || opsReceived > 0) && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                  <span className="text-xs text-gray-500">Scenario status:</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: riskStyle(scen.scenStatus).badge, color: riskStyle(scen.scenStatus).badgeText, border: `1px solid ${riskStyle(scen.scenStatus).border}` }}>
                    {scen.scenStatus}
                  </span>
                  <span className="text-xs" style={{ color: improved ? '#16A34A' : '#DC2626' }}>
                    {scen.scenGap > 0 ? '+' : ''}{scen.scenGap.toLocaleString()}h
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Staff Transfer Board ───────────────────────────────────────────────────────
function StaffTransferBoard({
  transfers, onTransferUpdate, scenarioLines,
}: {
  transfers: TransferMatrix;
  onTransferUpdate: (from: string, to: string, count: number) => void;
  scenarioLines: ScenarioLine[];
}) {
  const totalAllocated = Object.values(transfers).reduce((sum, targets) =>
    sum + Object.values(targets).reduce((s, c) => s + c, 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.5 }}
      className="bg-white rounded-2xl border overflow-hidden"
      style={{ borderColor: '#C4B5FD', boxShadow: '0 4px 20px rgba(99,102,241,0.08)' }}
    >
      {/* Board header */}
      <div className="px-5 py-3.5 border-b flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #F5F3FF, #EEF2FF)', borderColor: '#DDD6FE' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Shuffle className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">Staff Reallocation Board</div>
            <div className="text-xs text-purple-600 font-medium mt-0.5">Transfer operators from surplus lines to deficit lines</div>
          </div>
        </div>
        {totalAllocated > 0 && (
          <motion.div key={totalAllocated} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 border border-purple-200">
            <Users className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-xs font-bold text-purple-700">{totalAllocated} ops reallocated</span>
          </motion.div>
        )}
      </div>

      <div className="p-4">
        <div className="overflow-x-auto">
          <table className="text-sm w-full min-w-max">
            <thead>
              <tr>
                <th className="text-left pb-3 pr-4 text-xs font-semibold text-gray-500 whitespace-nowrap">
                  Donor Line <span className="font-normal text-gray-400">(surplus capacity)</span>
                </th>
                {RECIPIENT_LINES.map(r => {
                  const s = scenarioLines.find(l => l.line === r)!;
                  const style = riskStyle(s.scenStatus);
                  return (
                    <th key={r} className="pb-3 px-3 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{r}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: style.badge, color: style.badgeText }}>{s.scenStatus}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="pb-3 pl-3 text-xs font-semibold text-gray-500 text-right whitespace-nowrap">Used / Max</th>
              </tr>
            </thead>
            <tbody>
              {DONOR_LINES.map((donor, di) => {
                const maxOps = DONOR_MAX_OPS[donor];
                const totalSent = Object.values(transfers[donor] || {}).reduce((a, b) => a + b, 0);
                const donorLine = baselineLines.find(l => l.line === donor)!;
                return (
                  <motion.tr
                    key={donor}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: di * 0.08 }}
                    className="border-t border-gray-100 hover:bg-purple-50/30 transition-colors"
                  >
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{donor}</span>
                        <span className="text-xs text-emerald-600 font-semibold">+{donorLine.baseGap}h</span>
                        <span className="text-xs text-gray-400">({maxOps} ops avail.)</span>
                      </div>
                    </td>
                    {RECIPIENT_LINES.map(recipient => {
                      const count = (transfers[donor] || {})[recipient] || 0;
                      const canAdd = totalSent < maxOps;
                      return (
                        <td key={recipient} className="py-2.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onTransferUpdate(donor, recipient, Math.max(0, count - 1))}
                              disabled={count === 0}
                              className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0"
                            >−</button>
                            <motion.span
                              key={`${donor}-${recipient}-${count}`}
                              initial={{ scale: 1.4 }} animate={{ scale: 1 }}
                              className="w-6 text-center text-xs font-bold tabular-nums"
                              style={{ color: count > 0 ? '#7C3AED' : '#D1D5DB' }}
                            >{count}</motion.span>
                            <button
                              onClick={() => onTransferUpdate(donor, recipient, count + 1)}
                              disabled={!canAdd}
                              className="w-5 h-5 rounded border border-gray-200 flex items-center justify-center text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0"
                            >+</button>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div
                            animate={{ width: `${(totalSent / maxOps) * 100}%` }}
                            transition={{ duration: 0.4 }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: totalSent === maxOps ? '#EF4444' : '#8B5CF6' }}
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums" style={{ color: totalSent === maxOps ? '#DC2626' : '#374151' }}>
                          {totalSent}/{maxOps}
                        </span>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Transfer Summary */}
        {totalAllocated > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl p-3 flex items-start gap-2.5 border"
            style={{ backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}
          >
            <Zap className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div className="text-xs text-purple-800 leading-relaxed">
              <strong>{totalAllocated} operator{totalAllocated > 1 ? 's' : ''}</strong> reallocated from surplus lines —
              unlocking approximately <strong>+{totalAllocated * 280}h</strong> of effective capacity on receiving lines.
              No additional cost vs. temporary hire. Confirm line manager approval before end of March.
            </div>
          </motion.div>
        )}

        {totalAllocated === 0 && (
          <div className="mt-3 rounded-xl p-3 flex items-start gap-2 border border-dashed border-gray-200 bg-gray-50">
            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Use the +/− controls above to assign surplus operators from stable lines to critical/high lines. Capacity is reduced on donor lines and increased on recipients at no additional cost.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Labour Pool Scheduling Component ─────────────────────────────────────────
function LabourPoolScheduling({
  schedule, onToggle, onReset
}: {
  schedule: Record<string, boolean[]>;
  onToggle: (line: string, monthIdx: number) => void;
  onReset: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Count active lines per month
  const activePerMonth = MONTHS_SHORT.map((_, mi) =>
    POOL_A3_LINES.filter(line => schedule[line]?.[mi]).length
  );

  const totalActiveMonths = POOL_A3_LINES.reduce((sum, line) =>
    sum + (schedule[line]?.filter(Boolean).length ?? 0), 0
  );

  const riskColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    A302: { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74', dot: '#F97316' },
    A303: { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74', dot: '#F97316' },
    A304: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5', dot: '#EF4444' },
    A305: { bg: '#FEF2F2', text: '#991B1B', border: '#FCA5A5', dot: '#EF4444' },
    A307: { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D', dot: '#EAB308' },
    A308: { bg: '#F0FDF4', text: '#14532D', border: '#86EFAC', dot: '#22C55E' },
  };

  const violations = activePerMonth.filter(c => c > POOL_A3_MAX).length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl overflow-hidden border"
      style={{ borderColor: violations > 0 ? '#FCA5A5' : '#DDD6FE', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <button onClick={() => setCollapsed(!collapsed)}
        className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors hover:bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: violations > 0 ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}>
            <Calendar className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-bold text-gray-900">Plant A3 — Labour Pool Scheduling</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: violations > 0 ? '#FEF2F2' : '#F5F3FF', color: violations > 0 ? '#991B1B' : '#7C3AED', border: `1px solid ${violations > 0 ? '#FCA5A5' : '#DDD6FE'}` }}>
                {violations > 0 ? `⚠ ${violations} months over limit` : `✓ Within constraint`}
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Max {POOL_A3_MAX} of {POOL_A3_LINES.length} lines concurrent · Physical space &amp; crew constraint · Assign lines to months
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={e => { e.stopPropagation(); onReset(); }}
            className="text-xs px-2.5 py-1 rounded-lg border font-medium text-gray-500 hover:bg-gray-100 border-gray-200 transition-colors">
            Reset
          </button>
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="overflow-hidden">
            <div className="border-t border-gray-100 px-5 py-4">
              {/* Grid */}
              <div className="overflow-x-auto">
                <table className="text-xs w-full" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th className="text-left pr-4 pb-2 font-semibold text-gray-500 whitespace-nowrap" style={{ minWidth: 80 }}>Line</th>
                      {MONTHS_SHORT.map((m, mi) => (
                        <th key={m} className="text-center px-1 pb-2 font-semibold whitespace-nowrap"
                          style={{ color: LAUNCH_MONTHS.includes(mi) ? '#D97706' : '#94A3B8', minWidth: 44 }}>
                          {m}
                          {LAUNCH_MONTHS.includes(mi) && <div className="text-center" style={{ fontSize: 8, color: '#D97706' }}>▲</div>}
                        </th>
                      ))}
                      <th className="pl-4 pb-2 text-right font-semibold text-gray-500 whitespace-nowrap">Active months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POOL_A3_LINES.map((line, li) => {
                      const rc = riskColors[line] ?? { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0', dot: '#94A3B8' };
                      const activeCount = schedule[line]?.filter(Boolean).length ?? 0;
                      return (
                        <motion.tr key={line} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: li * 0.05 }}
                          className="border-t border-gray-100">
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: rc.dot }} />
                              <span className="font-mono font-black" style={{ color: '#1E293B' }}>{line}</span>
                            </div>
                          </td>
                          {MONTHS_SHORT.map((_, mi) => {
                            const isActive = schedule[line]?.[mi] ?? false;
                            const colCount = activePerMonth[mi];
                            const isLaunch = LAUNCH_MONTHS.includes(mi);
                            const wouldViolate = !isActive && colCount >= POOL_A3_MAX;
                            return (
                              <td key={mi} className="py-2 px-1 text-center">
                                <button
                                  onClick={() => !wouldViolate && onToggle(line, mi)}
                                  title={wouldViolate ? `Month already at max ${POOL_A3_MAX} lines — deactivate another line first` : isActive ? `Deactivate ${line} in ${MONTHS_SHORT[mi]}` : `Activate ${line} in ${MONTHS_SHORT[mi]}`}
                                  className="w-8 h-7 rounded-lg flex items-center justify-center mx-auto transition-all font-bold"
                                  style={{
                                    backgroundColor: isActive
                                      ? isLaunch ? '#FEF3C7' : rc.bg
                                      : wouldViolate ? '#F8FAFC' : '#F1F5F9',
                                    border: `1.5px solid ${isActive ? (isLaunch ? '#FCD34D' : rc.border) : '#E2E8F0'}`,
                                    color: isActive ? rc.text : '#CBD5E1',
                                    cursor: wouldViolate ? 'not-allowed' : 'pointer',
                                    opacity: wouldViolate ? 0.4 : 1,
                                    fontSize: 9,
                                  }}>
                                  {isActive ? '●' : '○'}
                                </button>
                              </td>
                            );
                          })}
                          <td className="py-2 pl-4 text-right">
                            <span className="font-bold tabular-nums" style={{ color: activeCount >= 8 ? '#15803D' : '#64748B' }}>
                              {activeCount}/12
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                  {/* Footer row — constraint counter per month */}
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td className="pt-2 pr-4 text-xs font-bold text-gray-600">Active / max</td>
                      {activePerMonth.map((count, mi) => {
                        const atMax = count === POOL_A3_MAX;
                        const over = count > POOL_A3_MAX;
                        return (
                          <td key={mi} className="pt-2 px-1 text-center">
                            <motion.div
                              key={count}
                              initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                              className="w-8 h-6 rounded-md flex items-center justify-center mx-auto text-xs font-black"
                              style={{
                                backgroundColor: over ? '#FEF2F2' : atMax ? '#EEF2FF' : '#F0FDF4',
                                color: over ? '#991B1B' : atMax ? '#4338CA' : '#15803D',
                              }}>
                              {count}/{POOL_A3_MAX}
                            </motion.div>
                          </td>
                        );
                      })}
                      <td className="pt-2 pl-4 text-right">
                        <span className="text-xs font-semibold text-gray-500">{totalActiveMonths} total</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Legend + notes */}
              <div className="mt-4 flex items-start gap-6 flex-wrap">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5"><div className="w-8 h-5 rounded-md bg-red-50 border border-red-200 flex items-center justify-center text-red-600 font-bold" style={{ fontSize: 8 }}>●</div><span className="text-gray-500">Active · launch month</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-8 h-5 rounded-md bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 font-bold" style={{ fontSize: 8 }}>●</div><span className="text-gray-500">Active · normal month</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-8 h-5 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 font-bold" style={{ fontSize: 8 }}>○</div><span className="text-gray-500">Inactive (line resting)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-8 h-6 rounded-md bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">4/4</div><span className="text-gray-500">At pool max</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-300" /><span className="text-gray-500">▲ Launch month (Mar–May)</span></div>
                </div>
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-xl p-3 border"
                style={{ backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }}>
                <Info className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" />
                <div className="text-xs text-violet-800 leading-relaxed">
                  <strong>How this works:</strong> Plant A3 has 6 filling lines but physical space and crew availability limits to <strong>{POOL_A3_MAX} simultaneous lines</strong>.
                  Toggle which lines run in each month. Critical lines (A304, A305) should be active during launch months (Mar–May).
                  Stable lines (A307, A308) can rest during peak to free up pool capacity for launch. Changes here affect the per-line capacity model.
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export function Scenarios() {
  const [activeTab, setActiveTab] = useState<'A' | 'B'>('B');
  const [lineControls, setLineControls] = useState<Record<string, LineControl>>({});
  const [transfers, setTransfers] = useState<TransferMatrix>({});
  const [globalOee, setGlobalOee] = useState(60); // improvement target above 55% baseline
  const [launchReduction, setLaunchReduction] = useState(5);
  const [poolSchedule, setPoolSchedule] = useState<Record<string, boolean[]>>(initialPoolSchedule);
  const [running, setRunning] = useState(false);
  const [hasResults, setHasResults] = useState(true);

  const getCtrl = (line: string): LineControl => lineControls[line] ?? DEFAULT_CTRL;
  const setCtrl = (line: string, u: Partial<LineControl>) =>
    setLineControls(p => ({ ...p, [line]: { ...getCtrl(line), ...u } }));

  const handleTransfer = (from: string, to: string, count: number) => {
    const maxOps = DONOR_MAX_OPS[from] || 0;
    const currentFrom = transfers[from] || {};
    const totalWithout = Object.entries(currentFrom)
      .filter(([k]) => k !== to)
      .reduce((s, [, v]) => s + v, 0);
    if (totalWithout + count > maxOps) {
      toast.error(`${from} can only spare ${maxOps} operator${maxOps > 1 ? 's' : ''} total`);
      return;
    }
    setTransfers(p => ({ ...p, [from]: { ...(p[from] || {}), [to]: count } }));
  };

  // Compute ops received per line (from transfers)
  const opsReceived = useMemo(() => {
    const map: Record<string, number> = {};
    Object.values(transfers).forEach(targets =>
      Object.entries(targets).forEach(([to, count]) => { map[to] = (map[to] || 0) + count; })
    );
    return map;
  }, [transfers]);

  const scenarioLines = useMemo(
    () => computeScenario(lineControls, transfers, globalOee, launchReduction),
    [lineControls, transfers, globalOee, launchReduction]
  );

  const baseCritical = baselineLines.filter(l => l.baseStatus === 'Critical').length;
  const scenCritical = scenarioLines.filter(l => l.scenStatus === 'Critical').length;
  const baseHoursGap = baselineLines.reduce((a, l) => a + Math.min(0, l.baseGap), 0);
  const scenHoursGap = scenarioLines.reduce((a, l) => a + Math.min(0, l.scenGap), 0);
  const hoursRecovered = scenHoursGap - baseHoursGap;

  const totalHireCost = Object.values(lineControls).reduce(
    (sum, c) => sum + c.extraHours * 80 + c.tempOps * 8 * 280, 0
  );

  const grouped = {
    Critical: baselineLines.filter(l => l.baseStatus === 'Critical'),
    High:     baselineLines.filter(l => l.baseStatus === 'High'),
    Watch:    baselineLines.filter(l => l.baseStatus === 'Watch'),
    Stable:   baselineLines.filter(l => l.baseStatus === 'Stable'),
  };

  function runScenario() {
    setRunning(true);
    setHasResults(false);
    toast.info('Running Scenario B…', { description: 'Computing per-line impact…' });
    setTimeout(() => {
      setRunning(false);
      setHasResults(true);
      toast.success('Scenario B ready', {
        description: `${scenCritical} critical lines vs ${baseCritical} baseline. +${hoursRecovered.toLocaleString()}h recovered.`,
      });
    }, 1600);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5" style={{ color: '#0F172A' }}>
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Scenario Planner</h1>
            <p className="text-sm mt-0.5 text-gray-500">
              Plan interventions line-by-line — adjust headcount, hours, OEE targets, and staff reallocation. Changes are non-destructive.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('A')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
                style={activeTab === 'A' ? { backgroundColor: '#FFF', color: '#0F172A', boxShadow: '0 1px 4px rgba(0,0,0,0.10)' } : { color: '#64748B' }}
              >
                <Lock className="w-3.5 h-3.5" /> Baseline A
              </button>
              <button
                onClick={() => setActiveTab('B')}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all"
                style={activeTab === 'B' ? { backgroundColor: '#FFF', color: '#4F46E5', boxShadow: '0 1px 4px rgba(99,102,241,0.2)' } : { color: '#64748B' }}
              >
                <GitBranch className="w-3.5 h-3.5" /> What-if B
              </button>
              <button className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Baseline A view ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'A' && (
          <motion.div key="A" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.3 }}>
            <div className="bg-white rounded-2xl border border-gray-200 p-6" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-gray-400" />
                <div className="text-sm font-bold text-gray-900">Scenario A — Baseline</div>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Locked</span>
              </div>
              <p className="text-sm text-gray-500 mb-5">March 2026 Plan — published batch. No modifications. All values from demand plan × std hrs/unit. OEE baseline = 55%. 12-month planning horizon.</p>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'Critical Lines', value: baseCritical.toString(), color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
                  { label: 'Total Hours Gap', value: `${baseHoursGap.toLocaleString()}h`, color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
                  { label: 'OEE Baseline', value: '55%', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
                  { label: 'Extra Cost', value: '£0', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl p-4 border" style={{ backgroundColor: kpi.bg, borderColor: kpi.border }}>
                    <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
                    <div className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Scenario B Workspace ── */}
        {activeTab === 'B' && (
          <motion.div key="B" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="space-y-5">

            {/* Live Impact Bar */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #1E1B4B, #312E81, #1E1B4B)', borderColor: '#4338CA' }}
            >
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-indigo-300" />
                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest">Live Scenario B Impact</span>
                  </div>
                  <span className="text-xs text-indigo-400">Updates as you adjust controls below</span>
                </div>
                <div className="grid grid-cols-4 gap-4 mt-3">
                  {[
                    { label: 'Critical Lines', base: baseCritical, scen: scenCritical, format: (v: number) => String(v), lowerBetter: true },
                    { label: 'Hours Gap', base: baseHoursGap, scen: scenHoursGap, format: (v: number) => `${v.toLocaleString()}h`, lowerBetter: false },
                    { label: 'Hours Recovered', base: 0, scen: hoursRecovered, format: (v: number) => `+${v.toLocaleString()}h`, lowerBetter: false },
                    { label: 'Estimated Cost', base: 0, scen: totalHireCost, format: (v: number) => `£${v.toLocaleString()}`, lowerBetter: true },
                  ].map(kpi => {
                    const delta = kpi.scen - kpi.base;
                    const improved = kpi.lowerBetter ? delta <= 0 : delta >= 0;
                    return (
                      <div key={kpi.label} className="text-center">
                        <div className="text-xs text-indigo-400 mb-1">{kpi.label}</div>
                        <motion.div key={kpi.scen} initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="text-xl font-bold text-white tabular-nums">{kpi.format(kpi.scen)}</motion.div>
                        {kpi.base !== 0 && (
                          <div className="text-xs mt-0.5" style={{ color: improved ? '#6EE7B7' : '#FCA5A5' }}>
                            {improved ? '↓' : '↑'} {kpi.label === 'Hours Gap' ? `${Math.abs(delta).toLocaleString()}h better` : `from ${kpi.format(kpi.base)}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Global Levers */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-white rounded-2xl border border-gray-200 p-4" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3.5">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <span className="text-sm font-bold text-gray-900">Global Levers</span>
                <span className="text-xs text-gray-400">— applied across all relevant lines</span>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">OEE Improvement Target (%)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Baseline: 55% · Target:</span>
                      <span className="text-xs font-bold text-indigo-700">{globalOee}%</span>
                    </div>
                  </div>
                  <input type="range" min={70} max={95} step={1} value={globalOee}
                    onChange={e => setGlobalOee(+e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#6366F1' }} />
                  <p className="text-xs text-gray-400 mt-1">Impacts A101 and A302 unless overridden per-line below</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">Launch Volume Reduction (%)</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Defer to Jun+</span>
                      <span className="text-xs font-bold text-indigo-700">{launchReduction}%</span>
                    </div>
                  </div>
                  <input type="range" min={0} max={20} step={1} value={launchReduction}
                    onChange={e => setLaunchReduction(+e.target.value)}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#6366F1' }} />
                  <p className="text-xs text-gray-400 mt-1">Applies to A201, A202, A304, A305 — confirm with Commercial</p>
                </div>
              </div>
            </motion.div>

            {/* Labour Pool Scheduling */}
            <LabourPoolScheduling
              schedule={poolSchedule}
              onToggle={(line, monthIdx) => {
                setPoolSchedule(prev => {
                  const lineSchedule = [...(prev[line] ?? [])];
                  lineSchedule[monthIdx] = !lineSchedule[monthIdx];
                  return { ...prev, [line]: lineSchedule };
                });
              }}
              onReset={() => setPoolSchedule(initialPoolSchedule)}
            />

            {/* Per-Line Interventions */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">

              {/* Critical Lines */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-300"></div>
                  <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Critical Lines</span>
                  <span className="text-xs text-gray-400">— require immediate intervention</span>
                  <div className="flex-1 h-px bg-red-100 ml-1"></div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {grouped.Critical.map((l, i) => {
                    const s = scenarioLines.find(sl => sl.line === l.line)!;
                    return (
                      <motion.div key={l.line} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.06 }}>
                        <LineCard baseline={l} scen={s} ctrl={getCtrl(l.line)} onUpdate={u => setCtrl(l.line, u)} mode="recipient" opsReceived={opsReceived[l.line] || 0} />
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* High Risk Lines */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-2 h-2 rounded-full bg-orange-500 shadow-sm shadow-orange-300"></div>
                  <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">High Risk Lines</span>
                  <span className="text-xs text-gray-400">— preventive action recommended</span>
                  <div className="flex-1 h-px bg-orange-100 ml-1"></div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {grouped.High.map((l, i) => {
                    const s = scenarioLines.find(sl => sl.line === l.line)!;
                    return (
                      <motion.div key={l.line} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 + i * 0.06 }}>
                        <LineCard baseline={l} scen={s} ctrl={getCtrl(l.line)} onUpdate={u => setCtrl(l.line, u)} mode="recipient" opsReceived={opsReceived[l.line] || 0} />
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Watch + Stable (collapsed sections) */}
              <WatchStableSection lines={[...grouped.Watch, ...grouped.Stable]} scenarioLines={scenarioLines} getCtrl={getCtrl} setCtrl={setCtrl} opsReceived={opsReceived} />
            </motion.div>

            {/* Staff Reallocation Board */}
            <StaffTransferBoard transfers={transfers} onTransferUpdate={handleTransfer} scenarioLines={scenarioLines} />

            {/* Run Button */}
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: '0 8px 24px rgba(99,102,241,0.45)' }}
                whileTap={{ scale: 0.97 }}
                onClick={runScenario}
                disabled={running}
                className="flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: running ? '#94A3B8' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                  boxShadow: running ? 'none' : '0 4px 16px rgba(99,102,241,0.4)',
                  cursor: running ? 'not-allowed' : 'pointer',
                }}
              >
                {running ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                    <Zap className="w-4 h-4" />
                  </motion.div>
                ) : <Play className="w-4 h-4" />}
                {running ? 'Computing Scenario B…' : 'Run Scenario B'}
              </motion.button>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
            </div>

            {/* ─── Results ─── */}
            <AnimatePresence>
              {hasResults && (
                <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="space-y-5">

                  {/* KPI comparison */}
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: 'Critical Lines', base: baseCritical, scen: scenCritical, lowerBetter: true, fmt: (v: number) => String(v), icon: AlertTriangle, iconColor: '#DC2626' },
                      { label: 'Hours Gap', base: baseHoursGap, scen: scenHoursGap, lowerBetter: false, fmt: (v: number) => `${v.toLocaleString()}h`, icon: TrendingUp, iconColor: '#3B82F6' },
                      { label: 'Extra Cost', base: 0, scen: totalHireCost, lowerBetter: true, fmt: (v: number) => `£${v.toLocaleString()}`, icon: DollarSign, iconColor: '#EA580C' },
                      { label: 'Service Risk', base: 0, scen: 0, lowerBetter: true, fmt: () => scenCritical <= 2 ? 'Medium' : 'High', icon: Shield, iconColor: '#7C3AED' },
                    ].map((kpi, ki) => {
                      const delta = kpi.scen - kpi.base;
                      const improved = kpi.lowerBetter ? delta <= 0 : delta >= 0;
                      return (
                        <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ki * 0.07 }}
                          className="bg-white rounded-xl p-4 border border-gray-200" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500">{kpi.label}</span>
                            <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.iconColor }} />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs text-gray-400">Baseline: <span className="font-medium text-gray-600">{kpi.fmt(kpi.base)}</span></div>
                            <div className="flex items-center gap-1.5">
                              <ArrowRight className="w-3 h-3 text-gray-300" />
                              <span className="text-sm font-bold text-gray-900">{kpi.fmt(kpi.scen)}</span>
                              {kpi.base !== 0 && delta !== 0 && (
                                <span className="text-xs font-bold" style={{ color: improved ? '#16A34A' : '#DC2626' }}>
                                  {improved ? '▼' : '▲'} {Math.abs(delta)}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Line Comparison Table */}
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                    <div className="px-5 py-3.5 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
                      <div className="text-sm font-bold text-gray-900">Line-by-Line Comparison</div>
                      <div className="text-xs mt-0.5 text-gray-500">Scenario A (Baseline) vs Scenario B — all 14 lines</div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead style={{ backgroundColor: '#F8FAFC' }}>
                          <tr>
                            {['Line', 'A Status', 'A Gap (h)', 'A Score', '', 'B Status', 'B Gap (h)', 'B Score', 'Δ Score', 'Interventions'].map((h, i) => (
                              <th key={i} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {scenarioLines.map((line, idx) => {
                            const as = riskStyle(line.baseStatus);
                            const bs = riskStyle(line.scenStatus);
                            const delta = line.baseScore - line.scenScore;
                            const ctrl = getCtrl(line.line);
                            const recv = opsReceived[line.line] || 0;
                            const hasIntervention = ctrl.extraHours > 0 || ctrl.tempOps > 0 || ctrl.oeeBoost > 0 || recv > 0;
                            return (
                              <motion.tr key={line.line}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.35 + idx * 0.025 }}
                                className="border-b last:border-0 hover:bg-gray-50/60 transition-colors"
                                style={{ borderColor: '#F1F5F9' }}>
                                <td className="px-4 py-2.5">
                                  <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{line.line}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: as.badge, color: as.badgeText, border: `1px solid ${as.border}` }}>{line.baseStatus}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs font-bold tabular-nums" style={{ color: line.baseGap < 0 ? '#DC2626' : '#16A34A' }}>
                                  {line.baseGap > 0 ? '+' : ''}{line.baseGap.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-bold text-gray-700 tabular-nums">{line.baseScore}</td>
                                <td className="px-4 py-2.5 text-gray-300 text-sm">→</td>
                                <td className="px-4 py-2.5">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bs.badge, color: bs.badgeText, border: `1px solid ${bs.border}` }}>{line.scenStatus}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs font-bold tabular-nums" style={{ color: line.scenGap < 0 ? '#DC2626' : '#16A34A' }}>
                                  {line.scenGap > 0 ? '+' : ''}{line.scenGap.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-bold text-gray-700 tabular-nums">{line.scenScore}</td>
                                <td className="px-4 py-2.5">
                                  {delta > 0 ? <span className="text-xs font-bold text-emerald-600">▼ {delta}</span>
                                    : delta < 0 ? <span className="text-xs font-bold text-red-600">▲ {Math.abs(delta)}</span>
                                      : <span className="text-xs text-gray-300">—</span>}
                                </td>
                                <td className="px-4 py-2.5">
                                  {hasIntervention ? (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {ctrl.extraHours > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">+{ctrl.extraHours}h</span>}
                                      {ctrl.tempOps > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-violet-50 text-violet-700 border border-violet-200 font-medium">{ctrl.tempOps} ops</span>}
                                      {ctrl.oeeBoost > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium">OEE+{ctrl.oeeBoost}%</span>}
                                      {recv > 0 && <span className="px-1.5 py-0.5 rounded text-xs bg-purple-50 text-purple-700 border border-purple-200 font-medium">↑{recv} xfr</span>}
                                    </div>
                                  ) : <span className="text-xs text-gray-300">—</span>}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>

                  {/* Financial + AI */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Financial Impact */}
                    <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
                      className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                      <div className="px-5 py-3.5 border-b border-gray-100">
                        <div className="text-sm font-bold text-gray-900">Financial Impact — Scenario B</div>
                        <div className="text-xs mt-0.5 text-gray-500">Estimated based on standard cost rates from Masterdata</div>
                      </div>
                      <div className="p-5">
                        <table className="w-full text-sm">
                          <tbody>
                            {[
                              { item: 'Overtime hours cost', value: `£${Object.values(lineControls).reduce((s, c) => s + c.extraHours * 80, 0).toLocaleString()}`, note: `${Object.values(lineControls).reduce((s, c) => s + c.extraHours, 0)}h × £80/h`, positive: false },
                              { item: 'Temporary labour cost', value: `£${Object.values(lineControls).reduce((s, c) => s + c.tempOps * 8 * 280, 0).toLocaleString()}`, note: `${Object.values(lineControls).reduce((s, c) => s + c.tempOps, 0)} ops × 8wk × £280`, positive: false },
                              { item: 'Staff transfer cost', value: '£0', note: 'Internal reallocation — no hire cost', positive: true },
                              { item: 'Revenue at risk (no action)', value: '£2,400,000', note: '4 critical lines × 12 weeks', positive: true },
                              { item: 'Net benefit of Scenario B', value: `£${(2400000 - totalHireCost).toLocaleString()}`, note: 'vs. doing nothing', positive: true },
                            ].map(row => (
                              <tr key={row.item} className="border-b last:border-0" style={{ borderColor: '#F1F5F9' }}>
                                <td className="py-2.5 text-xs text-gray-600">{row.item}</td>
                                <td className="py-2.5 text-xs text-gray-400">{row.note}</td>
                                <td className="py-2.5 text-sm font-bold text-right" style={{ color: row.positive ? '#059669' : '#DC2626' }}>{row.value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-4 rounded-xl p-3 flex items-start gap-2" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                          <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                          <div className="text-xs text-emerald-800 leading-relaxed">
                            Scenario B strongly favours action. Inaction costs <strong>£2.4M</strong> in revenue at risk vs <strong>£{totalHireCost.toLocaleString()}</strong> for the proposed lever set.
                          </div>
                        </div>
                      </div>
                    </motion.div>

                    {/* AI Commentary */}
                    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}
                      className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2" style={{ background: 'linear-gradient(to right, #F5F3FF, white)' }}>
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-gray-900">AI Scenario Commentary</div>
                          <div className="text-xs text-violet-600">Generated from current lever configuration</div>
                        </div>
                      </div>
                      <div className="p-5 space-y-2.5">
                        <div className="rounded-xl p-3 text-xs leading-relaxed bg-blue-50 border border-blue-200 text-blue-900">
                          Scenario B reduces critical lines from <strong>{baseCritical}</strong> to <strong>{scenCritical}</strong>.
                          The combination of extra hours, temporary operators, and staff reallocation recovers approximately <strong>+{hoursRecovered.toLocaleString()}h</strong> across the planning horizon.
                        </div>
                        <div className="rounded-xl p-3 text-xs leading-relaxed bg-amber-50 border border-amber-200 text-amber-900">
                          <strong>Caveat:</strong> A304's maintenance conflict in April cannot be fully resolved through staffing levers alone. A separate maintenance schedule review is recommended to move the downtime to August, recovering the remaining ~280h constraint window.
                        </div>
                        {launchReduction > 0 && (
                          <div className="rounded-xl p-3 text-xs leading-relaxed bg-emerald-50 border border-emerald-200 text-emerald-900">
                            The {launchReduction}% launch volume reduction on A201/A202/A304/A305 defers approx. <strong>{(launchReduction * 55 * 4).toLocaleString()}h</strong> of demand to Jun+, smoothing the Mar–May peak. Requires Commercial alignment.
                          </div>
                        )}
                        <div className="rounded-xl p-3 text-xs leading-relaxed bg-violet-50 border border-violet-200 text-violet-900">
                          <strong>Recommendation:</strong> Proceed with Scenario B lever set. Total cost <strong>£{totalHireCost.toLocaleString()}</strong> — strong ROI vs £2.4M revenue at risk. Escalate to Executive Summary for approval.
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Watch/Stable Section (collapsible) ────────────────────────────────────────
function WatchStableSection({
  lines, scenarioLines, getCtrl, setCtrl, opsReceived,
}: {
  lines: BaselineLine[];
  scenarioLines: ScenarioLine[];
  getCtrl: (l: string) => LineControl;
  setCtrl: (l: string, u: Partial<LineControl>) => void;
  opsReceived: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const watchLines = lines.filter(l => l.baseStatus === 'Watch');
  const stableLines = lines.filter(l => l.baseStatus === 'Stable');

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 group mb-2.5 w-full text-left">
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Watch &amp; Stable Lines</span>
        <span className="text-xs text-gray-400">({lines.length} lines — lower priority)</span>
        <div className="flex-1 h-px bg-gray-200 ml-1"></div>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 transition-transform duration-200 shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden space-y-4">
            {watchLines.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {watchLines.map(l => {
                  const s = scenarioLines.find(sl => sl.line === l.line)!;
                  return <LineCard key={l.line} baseline={l} scen={s} ctrl={getCtrl(l.line)} onUpdate={u => setCtrl(l.line, u)} mode="watch" opsReceived={opsReceived[l.line] || 0} />;
                })}
              </div>
            )}
            {stableLines.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Stable Lines — available as staff donors
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {stableLines.map(l => {
                    const s = scenarioLines.find(sl => sl.line === l.line)!;
                    return <LineCard key={l.line} baseline={l} scen={s} ctrl={getCtrl(l.line)} onUpdate={u => setCtrl(l.line, u)} mode="donor" opsReceived={opsReceived[l.line] || 0} />;
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
