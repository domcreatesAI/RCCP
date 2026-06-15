import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle, CheckCircle2, Download, Bot, ThumbsUp, ThumbsDown,
  X, Shield, TrendingDown, Activity, FileText, BarChart2, ClipboardList,
  ChevronRight, Info, Sparkles, Clock, Users, TrendingUp, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Animated Counter ───────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1400, delay = 0) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      started.current = true;
      const start = Date.now();
      const tick = () => {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return value;
}

// ─── Capacity Heatmap ──────────────────────────────────────────────────────────
// Updated: 12-month planning · OEE 55% baseline · firm (YPAC) + forecast (LA) totals
const HEATMAP_LINES = [
  { line: 'A201', required: 3120, available: 2888, status: 'Critical' },
  { line: 'A202', required: 3060, available: 2888, status: 'Critical' },
  { line: 'A304', required: 3480, available: 2888, status: 'Critical' },
  { line: 'A305', required: 3180, available: 2888, status: 'Critical' },
  { line: 'A101', required: 2060, available: 1925, status: 'High'     },
  { line: 'A302', required: 2210, available: 1925, status: 'High'     },
  { line: 'A303', required: 2080, available: 1925, status: 'High'     },
];
// 12 months: Jan–Dec 2026 (indices 0–11)
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LAUNCH_IDX = [2, 3, 4]; // Mar, Apr, May = A-Range & D-Range launch

// Monthly demand pattern (relative to annual average)
// Launch months spike to ~1.35–1.45× avg; holiday months dip to ~0.80×
const monthPattern = [0.91, 0.94, 1.17, 1.35, 1.25, 1.05, 0.88, 0.82, 0.92, 1.06, 1.05, 0.87];
const avgPattern = monthPattern.reduce((a, b) => a + b, 0) / monthPattern.length;

function getMonthUtil(line: typeof HEATMAP_LINES[0], monthIdx: number): number {
  const baseUtil = line.required / line.available;
  const mp = monthPattern[monthIdx];
  let u = baseUtil * (mp / avgPattern);
  // Critical launch lines peak harder in Mar–May
  if (['A201', 'A202', 'A304', 'A305'].includes(line.line) && LAUNCH_IDX.includes(monthIdx)) u *= 1.16;
  // A304 has maintenance conflict in April
  if (line.line === 'A304' && monthIdx === 3) u *= 1.10;
  return Math.min(u, 1.65);
}

function utilColor(u: number): { bg: string; text: string } {
  if (u < 0.75) return { bg: '#D1FAE5', text: '#065F46' };
  if (u < 0.90) return { bg: '#A7F3D0', text: '#047857' };
  if (u < 1.00) return { bg: '#FEF9C3', text: '#854D0E' };
  if (u < 1.15) return { bg: '#FED7AA', text: '#9A3412' };
  if (u < 1.30) return { bg: '#FECACA', text: '#991B1B' };
  return { bg: '#FCA5A5', text: '#7F1D1D' };
}

function CapacityHeatmap() {
  const [hovered, setHovered] = useState<{ line: string; month: string; util: number } | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-max">
        <thead>
          <tr>
            <th className="text-left pb-2 pr-3 font-semibold text-gray-500 text-xs whitespace-nowrap">Line</th>
            {MONTHS.map((m, mi) => (
              <th key={m} className="pb-2 px-1 text-center font-semibold whitespace-nowrap"
                style={{ color: LAUNCH_IDX.includes(mi) ? '#D97706' : '#9CA3AF', fontSize: 10 }}>
                {m}
                {LAUNCH_IDX.includes(mi) && <div className="w-1 h-1 rounded-full bg-amber-400 mx-auto mt-0.5" />}
              </th>
            ))}
            <th className="pb-2 pl-2 font-semibold text-gray-500 whitespace-nowrap text-right">Avg Util</th>
          </tr>
        </thead>
        <tbody>
          {HEATMAP_LINES.map((line, li) => {
            const monthUtils = MONTHS.map((_, mi) => getMonthUtil(line, mi));
            const avgLineUtil = monthUtils.reduce((a, b) => a + b, 0) / monthUtils.length;
            const avgColor = utilColor(avgLineUtil);
            return (
              <motion.tr key={line.line}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * li }}>
                <td className="py-1 pr-3 whitespace-nowrap">
                  <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">{line.line}</span>
                </td>
                {monthUtils.map((u, mi) => {
                  const color = utilColor(u);
                  const isHov = hovered?.line === line.line && hovered.month === MONTHS[mi];
                  return (
                    <td key={mi} className="py-1 px-0.5">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 + li * 0.05 + mi * 0.02 }}
                        whileHover={{ scale: 1.15, zIndex: 10 }}
                        onHoverStart={() => setHovered({ line: line.line, month: MONTHS[mi], util: u })}
                        onHoverEnd={() => setHovered(null)}
                        className="w-8 h-7 rounded-md flex items-center justify-center cursor-pointer text-xs font-bold relative"
                        style={{
                          backgroundColor: color.bg,
                          color: color.text,
                          boxShadow: isHov ? `0 4px 12px ${color.bg}` : 'none',
                          border: isHov ? `2px solid ${color.text}` : '1.5px solid transparent',
                        }}
                      >
                        {Math.round(u * 100)}
                      </motion.div>
                    </td>
                  );
                })}
                <td className="py-1 pl-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold"
                    style={{ backgroundColor: avgColor.bg, color: avgColor.text }}>
                    {Math.round(avgLineUtil * 100)}%
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      {/* Heatmap tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <span className="font-mono font-bold text-indigo-700">{hovered.line}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{hovered.month}</span>
            <span className="text-gray-400">·</span>
            <span className="font-bold" style={{ color: utilColor(hovered.util).text }}>
              {Math.round(hovered.util * 100)}% utilisation
            </span>
            {hovered.util > 1.0 && (
              <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                +{Math.round((hovered.util - 1) * 100)}% overload
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Utilisation:</span>
        {[
          { label: '<75%', bg: '#D1FAE5', text: '#065F46' },
          { label: '75–90%', bg: '#A7F3D0', text: '#047857' },
          { label: '90–100%', bg: '#FEF9C3', text: '#854D0E' },
          { label: '100–115%', bg: '#FED7AA', text: '#9A3412' },
          { label: '115–130%', bg: '#FECACA', text: '#991B1B' },
          { label: '>130%', bg: '#FCA5A5', text: '#7F1D1D' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-md" style={{ backgroundColor: l.bg, border: `1px solid ${l.text}30` }} />
            <span className="text-xs" style={{ color: l.text }}>{l.label}</span>
          </div>
        ))}
        <span className="text-xs text-amber-600 ml-2 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
          Launch window (Mar–May)
        </span>
      </div>
    </div>
  );
}

// ─── Approval Modal ─────────────────────────────────────────────────────────────
function ApprovalModal({ onClose, onApprove }: { onClose: () => void; onApprove: () => void }) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'review' | 'confirm'>('review');

  function handleApprove() {
    setStep('confirm');
    setTimeout(() => {
      setSubmitting(true);
      setTimeout(() => {
        toast.success('RCCP Recommendation Approved', { description: 'Logged by John Davies — VP Operations. Ref: APP-2025-0042.' });
        onApprove();
        onClose();
      }, 800);
    }, 400);
  }
  function handleReject() {
    if (!comment.trim()) { toast.error('A comment is required when rejecting.'); return; }
    setSubmitting(true);
    setTimeout(() => {
      toast.error('Recommendation Rejected', { description: 'Returned to planner for revision.' });
      onClose();
    }, 900);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: step === 'confirm' ? 0.6 : 1, scale: step === 'confirm' ? 0.98 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        style={{ border: '1px solid #E2E8F0' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between"
          style={{ background: 'linear-gradient(135deg, #F0F9FF, #EEF2FF)' }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="text-base font-bold text-gray-900">Executive Approval Review</div>
            </div>
            <div className="text-xs text-gray-500 ml-9">RCCP Recommendation — March 2026 Planning Cycle</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/70 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-1">What You Are Approving</div>
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div className="text-sm font-semibold text-gray-900 mb-3">Scenario B Lever Set — March 2026 Plan</div>
            {[
              { icon: Users, text: 'Raise temporary operator request: 8 FTE for Mar–May launch window (A201, A202, A304)' },
              { icon: Clock, text: 'Approve 480h additional capacity hours across critical lines' },
              { icon: TrendingUp, text: 'Apply OEE improvement programme: A101, A302 — target 65% (from 55% baseline)' },
              { icon: Zap, text: 'Initiate maintenance schedule review: A304 — move Apr downtime to Aug' },
              { icon: Activity, text: 'Notify Commercial to review A201/A202 launch volume split' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className="flex items-start gap-2.5 text-xs text-gray-700">
                <item.icon className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                {item.text}
              </motion.div>
            ))}
          </div>

          <div className="rounded-xl p-3 flex items-start gap-2" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <strong>Note:</strong> Assumptions (OEE targets, cost rates, capacity hours) cannot be modified here. Use Scenarios to adjust and re-run before submitting.
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Comments <span className="font-normal text-gray-400">(required for rejection)</span>
            </label>
            <textarea
              rows={3} value={comment} onChange={e => setComment(e.target.value)}
              placeholder="Add your review comments, conditions, or notes for the record…"
              className="w-full rounded-xl px-3 py-2.5 text-xs resize-none outline-none transition-all"
              style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#334155' }}
              onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between" style={{ backgroundColor: '#FAFAFA' }}>
          <div className="text-xs text-gray-400">All decisions are logged, versioned, and audit-trailed.</div>
          <div className="flex items-center gap-2">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleReject} disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
              <ThumbsDown className="w-3.5 h-3.5" /> Reject
            </motion.button>
            <motion.button whileHover={{ scale: 1.02, boxShadow: '0 6px 16px rgba(22,163,74,0.35)' }} whileTap={{ scale: 0.98 }}
              onClick={handleApprove} disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
              style={{ backgroundColor: '#16A34A', boxShadow: '0 2px 8px rgba(22,163,74,0.3)' }}>
              <ThumbsUp className="w-3.5 h-3.5" /> Approve
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function ExecutiveSummary() {
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<'draft' | 'submitted' | 'approved'>('submitted');
  const [heatmapOpen, setHeatmapOpen] = useState(true);

  const criticalCount  = useCountUp(4,    1200, 300);
  const peakOverload   = useCountUp(21,   1000, 400); // A304 Apr gap = -20.5%
  const revenueAtRisk  = useCountUp(16,   1100, 500); // £1.6M if no action (annual basis)
  const scenarioCost   = useCountUp(428,  900,  600); // Scenario B est. cost
  const netBenefit     = useCountUp(1720, 1300, 700); // net benefit vs doing nothing

  const stagger = (i: number) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay: i * 0.08 + 0.1, duration: 0.5 } });

  return (
    <>
      <AnimatePresence>
        {approvalOpen && (
          <ApprovalModal
            onClose={() => setApprovalOpen(false)}
            onApprove={() => setApprovalStatus('approved')}
          />
        )}
      </AnimatePresence>

      <div className="p-6 space-y-5" style={{ color: '#0F172A' }}>

        {/* ── Document Header ── */}
        <motion.div {...stagger(0)}>
          <div className="rounded-2xl overflow-hidden border border-indigo-200/60"
            style={{ boxShadow: '0 4px 20px rgba(99,102,241,0.10)', background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #312E81 100%)' }}>
            <div className="px-6 py-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs mb-3" style={{ color: '#818CF8' }}>
                    <span>RCCP One</span>
                    <ChevronRight className="w-3 h-3" />
                    <span>Executive Summary</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="font-semibold text-indigo-200">March 2026 Planning Cycle</span>
                  </div>
                  <h1 className="text-white mb-1" style={{ fontSize: '22px', fontWeight: 700, lineHeight: 1.3 }}>
                    Rough-Cut Capacity Planning
                    <br />
                    <span style={{ color: '#A5B4FC' }}>March 2026 — Executive Briefing</span>
                  </h1>
                  <div className="flex items-center gap-3 text-xs mt-2" style={{ color: '#64748B' }}>
                    <span className="text-slate-400">Generated: 06 Mar 2026, 09:14</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">Prepared by: Jane Smith, Senior Planner</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400">Horizon: Jan–Dec 2026 (12 months rolling)</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0 ml-6">
                  {approvalStatus === 'submitted' && (
                    <motion.div
                      animate={{ opacity: [1, 0.6, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: '#FCD34D', border: '1px solid rgba(252,211,77,0.3)' }}>
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      Awaiting Approval
                    </motion.div>
                  )}
                  {approvalStatus === 'approved' && (
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.3)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </motion.div>
                  )}
                  <div className="text-xs text-slate-500">Ref: RCCP-2026-M03-001</div>
                </div>
              </div>
            </div>
            {/* Bottom accent bar */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(to right, #6366F1, #8B5CF6, #EC4899)' }} />
          </div>
        </motion.div>

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-5 gap-3">
          {([
            { label: 'Critical Lines',  fmt: () => `${criticalCount}`,        context: 'of 14 total',           color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: AlertTriangle },
            { label: 'Peak Overload',   fmt: () => `+${peakOverload}%`,       context: 'Line A304, Apr 2026',   color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', icon: TrendingDown },
            { label: 'Revenue at Risk', fmt: () => `£${(revenueAtRisk * 100).toLocaleString()}K`, context: 'If no action taken', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: Shield },
            { label: 'Scenario B Cost', fmt: () => `£${(scenarioCost * 100).toLocaleString()}`, context: 'Recommended lever set',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: Activity },
            { label: 'Net Benefit',     fmt: () => `£${(netBenefit / 1000).toFixed(2)}M`,    context: 'vs. doing nothing',     color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: CheckCircle2 },
          ] as const).map((kpi, i) => (
            <motion.div key={kpi.label} {...stagger(i + 1)}
              whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-xl p-3.5 border cursor-default"
              style={{ borderColor: kpi.border, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">{kpi.label}</span>
                <kpi.icon className="w-3.5 h-3.5" style={{ color: kpi.color }} />
              </div>
              <div className="text-xl font-bold tabular-nums" style={{ color: kpi.color }}>
                {kpi.fmt()}
              </div>
              <div className="text-xs mt-0.5 text-gray-400">{kpi.context}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Headline Risk Callout ── */}
        <motion.div {...stagger(6)} className="space-y-3">
          <div className="bg-white rounded-2xl p-5 border border-gray-200" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="text-lg font-bold text-gray-900 leading-snug">
              4 production lines at critical capacity risk across the 12-month planning horizon — concentrated in the Mar–May new product launch window.
            </div>
            <div className="mt-2 text-sm leading-relaxed text-gray-600">
              The March 2026 RCCP baseline (OEE 55%) identifies a cumulative capacity shortfall of <strong className="text-gray-900">1,288 hours</strong> across Lines A201, A202, A304, and A305 during the A-Range and D-Range launch window (Mar–May). Labour shortages compound the constraint and the Plant A3 pool is physically constrained to 4 of 6 concurrent lines. Without intervention, on-time delivery is at material risk.
            </div>
          </div>
          <motion.div
            animate={{ borderColor: ['#FECACA', '#FCA5A5', '#FECACA'] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="rounded-2xl p-4 flex items-start gap-3 border-2"
            style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div>
              <div className="text-sm font-bold text-red-800">Immediate Action Required — Deadline: Before Apr 2026</div>
              <div className="text-sm mt-0.5 leading-relaxed text-red-700">
                Lines A201, A202, A304, and A305 are at critical overload during the Mar–May launch window. Line A304 faces a compounded constraint due to a scheduled maintenance conflict in April coinciding with peak launch volume. Plant A3 pool at max 4/6 concurrent lines. Executive sign-off required by 14 March.
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Capacity Heatmap ── */}
        <motion.div {...stagger(7)} className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <button onClick={() => setHeatmapOpen(!heatmapOpen)}
            className="w-full px-5 py-3.5 flex items-center justify-between border-b border-gray-100 text-left"
            style={{ background: 'linear-gradient(to right, #F8FAFF, white)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-5 rounded-full bg-indigo-500"></div>
              <div>
                <div className="text-sm font-bold text-gray-900">Capacity Utilisation Heatmap</div>
                <div className="text-xs text-gray-500 mt-0.5">Critical &amp; high risk lines · Jan–Dec 2026 · % of available capacity</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">Launch: Mar–May ▲</span>
              <ChevronRight className="w-4 h-4 text-gray-400 transition-transform duration-200" style={{ transform: heatmapOpen ? 'rotate(90deg)' : 'rotate(0deg)' }} />
            </div>
          </button>
          <AnimatePresence>
            {heatmapOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                <div className="p-5">
                  <CapacityHeatmap />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Main Content Grid ── */}
        <div className="grid gap-5" style={{ gridTemplateColumns: '3fr 2fr' }}>
          <div className="space-y-5">
            {/* What This Means */}
            <motion.div {...stagger(8)} className="bg-white rounded-2xl border border-gray-200 p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-1 h-5 rounded-full bg-indigo-500"></div>
                <h2 className="text-sm font-bold text-gray-900">What This Means</h2>
              </div>
              <div className="space-y-2.5 text-sm leading-relaxed text-gray-600">
                <p>The current demand plan creates a capacity overload of up to <strong className="text-gray-900">20.5%</strong> on Line A304 during the Mar–May launch window — the most severe single-line constraint in this planning cycle. The OEE baseline of <strong className="text-gray-900">55%</strong> leaves no buffer.</p>
                <p>Labour shortages compound the issue on A201, A202, and A305. Plant A3 pool constraint (max 4 of 6 lines concurrent) requires explicit monthly scheduling. Without additional operators and an agreed pool schedule, line utilisation cannot reach the levels required to meet the demand plan.</p>
                <p>Lines A302 and A101 are rated High risk primarily due to <strong className="text-gray-900">OEE performance below the 55% site baseline target</strong> (current rolling avg: 52% and 53% respectively), creating effective capacity loss that accumulates across the 12-month horizon.</p>
                <p>Stable excess capacity exists on A103, A308, A501, and A502 — these lines are within plan and have headroom that <em>could</em> be considered for staff reallocation where product routing permits.</p>
              </div>
            </motion.div>

            {/* Recommended Actions */}
            <motion.div {...stagger(9)} className="bg-white rounded-2xl border border-gray-200 p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-1 h-5 rounded-full bg-emerald-500"></div>
                <h2 className="text-sm font-bold text-gray-900">Recommended Actions</h2>
              </div>
              <div className="space-y-2.5">
                {[
                  { priority: 'Critical', action: 'Approve Scenario B lever set', detail: 'Estimated to reduce critical lines from 4 to 2. Requires VP Operations sign-off before Apr launch.', deadline: 'By 14 Mar' },
                  { priority: 'Critical', action: 'Initiate maintenance schedule review for A304', detail: 'Move planned Apr downtime to Aug. Recover estimated 280h during the critical launch window.', deadline: 'By 21 Mar' },
                  { priority: 'High', action: 'Raise temporary staffing request — minimum 8 operators', detail: 'Required across A201, A202, A304 for Mar–May. Escalate to HR and Staffing Partners immediately.', deadline: 'By 7 Mar' },
                  { priority: 'High', action: 'Review portfolio launch sequence and LP-A3 pool schedule', detail: 'Consider splitting A201/A202 launch volume across Mar and Jun. Confirm LP-A3 line rotation is agreed by plant managers.', deadline: 'By 14 Mar' },
                  { priority: 'Watch', action: 'Monitor OEE on A101 and A302 monthly', detail: 'Target 65% by Q3. Flag if tracking below 60% — triggers additional risk review.', deadline: 'Monthly' },
                ].map((item, i) => {
                  const c = item.priority === 'Critical' ? { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', dot: '#EF4444' }
                    : item.priority === 'High' ? { bg: '#FFF7ED', text: '#9A3412', border: '#FED7AA', dot: '#F97316' }
                      : { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' };
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + i * 0.07 }}
                      whileHover={{ x: 3 }}
                      className="flex items-start gap-3 p-3.5 rounded-xl cursor-default transition-all"
                      style={{ backgroundColor: '#FAFAFA', border: '1px solid #F1F5F9' }}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-white text-xs font-bold shadow-sm"
                        style={{ backgroundColor: c.dot }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-sm font-semibold text-gray-900">{item.action}</span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{item.priority}</span>
                          <span className="text-xs text-gray-400 font-medium ml-auto">{item.deadline}</span>
                        </div>
                        <div className="text-xs leading-relaxed text-gray-500">{item.detail}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          <div className="space-y-5">
            {/* Financial Impact */}
            <motion.div {...stagger(8)} className="bg-white rounded-2xl border border-gray-200 p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-1 h-5 rounded-full bg-amber-400"></div>
                <h2 className="text-sm font-bold text-gray-900">Estimated Financial Impact</h2>
              </div>
              <table className="w-full text-xs">
                <tbody className="divide-y divide-gray-100">
                  {[
                    { item: 'Revenue at risk (if no action)', val: '£2,400,000', neg: true, note: '4 critical lines × 12w' },
                    { item: 'Overtime cost (Scenario B)', val: '£38,400', neg: false, note: '480h × £80/h' },
                    { item: 'Temporary labour cost', val: '£18,200', neg: false, note: '8 ops × 8w × £280/w' },
                    { item: 'Total Scenario B cost', val: '£56,600', neg: false, note: 'Combined levers', bold: true },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 pr-2" style={{ color: '#64748B' }}>{row.item}</td>
                      <td className="py-2.5 text-right font-bold" style={{ color: row.neg ? '#DC2626' : '#334155', fontWeight: row.bold ? 700 : 600 }}>{row.val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-gray-900">Net benefit of action</span>
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2 }}
                    className="text-lg font-bold text-emerald-600">
                    £2,343,400
                  </motion.span>
                </div>
                <div className="text-xs text-gray-400">Cost-benefit ratio ≈ 1:41 — strongly favours approving Scenario B</div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: '97.6%' }}
                    transition={{ delay: 1.0, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>Cost</span><span>Net Benefit (97.6% of value saved)</span>
                </div>
              </div>
            </motion.div>

            {/* AI Decision Support */}
            <motion.div {...stagger(10)} className="bg-white rounded-2xl border border-gray-200 overflow-hidden" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5"
                style={{ background: 'linear-gradient(to right, #F5F3FF, white)' }}>
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md">
                  <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </motion.div>
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">AI Decision Support</div>
                  <div className="text-xs text-violet-600">3 insights · generated from baseline data</div>
                </div>
              </div>
              <div className="p-4 space-y-2.5">
                {[
                  { text: 'All four critical lines share a common root cause — the A-Range &amp; D-Range launch concentration in Mar–May. Volume spreading is the highest-leverage single action available.', type: 'insight' },
                  { text: 'Scenario B reduces critical lines from 4 to 2 at a cost-benefit ratio of approximately 1:41. Recommend approval.', type: 'recommend' },
                  { text: 'A304 maintenance conflict persists after Scenario B levers. Separate escalation path required — not addressed by current interventions.', type: 'warn' },
                ].map((item, i) => {
                  const s = item.type === 'recommend' ? { bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D' }
                    : item.type === 'warn' ? { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E' }
                      : { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' };
                  return (
                    <motion.div key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 + i * 0.1 }}
                      className="rounded-xl p-3 text-xs leading-relaxed"
                      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
                      {item.text}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Outputs + Approval ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Download Outputs */}
          <motion.div {...stagger(11)} className="bg-white rounded-2xl border border-gray-200 p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full bg-gray-400"></div>
              <h2 className="text-sm font-bold text-gray-900">Download Outputs</h2>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Download Board PDF', icon: FileText, desc: 'Full executive summary — formatted for board presentation', action: () => toast.info('Generating board PDF…') },
                { label: 'Download Chart Pack', icon: BarChart2, desc: 'Capacity charts, risk tables, and scenario comparison', action: () => toast.info('Generating chart pack…') },
                { label: 'Download Recommendation Log', icon: ClipboardList, desc: 'Full AI recommendation list with scoring and rationale', action: () => toast.info('Generating recommendation log…') },
              ].map(item => (
                <motion.button key={item.label} whileHover={{ x: 3 }} whileTap={{ scale: 0.99 }}
                  onClick={item.action}
                  className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:bg-gray-50 border border-gray-200 hover:border-indigo-200 group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-indigo-100 transition-colors" style={{ backgroundColor: '#EFF6FF' }}>
                    <item.icon className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                      <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>

          {/* Approval Workflow */}
          <motion.div {...stagger(12)} className="bg-white rounded-2xl border border-gray-200 p-5" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 rounded-full bg-violet-500"></div>
              <h2 className="text-sm font-bold text-gray-900">Approval Workflow</h2>
            </div>

            <div className="space-y-2 mb-4">
              {[
                { step: 1, label: 'Planner submits for review', status: 'done', who: 'J. Smith', when: '22 Jan 14:38' },
                { step: 2, label: 'Awaiting executive review', status: approvalStatus === 'approved' ? 'done' : 'active', who: 'John Davies (VP Ops)', when: approvalStatus === 'approved' ? 'Approved' : 'Deadline: 24 Jan' },
                { step: 3, label: approvalStatus === 'approved' ? 'Approved ✓' : 'Pending approval', status: approvalStatus === 'approved' ? 'done' : 'upcoming', who: approvalStatus === 'approved' ? 'J. Davies' : null, when: approvalStatus === 'approved' ? 'Just now' : null },
              ].map((item, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.1 }} className="flex items-start gap-3">
                  <motion.div
                    animate={item.status === 'active' ? { boxShadow: ['0 0 0 0 rgba(37,99,235,0.4)', '0 0 0 6px rgba(37,99,235,0)', '0 0 0 0 rgba(37,99,235,0)'] } : {}}
                    transition={{ duration: 1.8, repeat: Infinity }}
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: item.status === 'done' ? '#16A34A' : item.status === 'active' ? '#2563EB' : '#F1F5F9',
                      color: item.status === 'upcoming' ? '#94A3B8' : '#FFF',
                    }}>
                    {item.status === 'done' ? '✓' : item.step}
                  </motion.div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: item.status === 'upcoming' ? '#94A3B8' : '#334155' }}>{item.label}</div>
                    {item.who && <div className="text-xs text-gray-400 mt-0.5">{item.who} · {item.when}</div>}
                  </div>
                </motion.div>
              ))}
            </div>

            {approvalStatus !== 'approved' && (
              <>
                <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div className="text-xs font-semibold text-amber-800">Awaiting approval from <span className="font-bold">John Davies</span></div>
                  <div className="text-xs text-amber-600 mt-0.5">Deadline: 24 January 2025 — 2 days remaining</div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 20px rgba(37,99,235,0.35)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setApprovalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #4F46E5)', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
                  <Shield className="w-4 h-4" />
                  Open Approval Review
                </motion.button>
              </>
            )}
            {approvalStatus === 'approved' && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="rounded-xl p-4 flex items-center gap-3" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-bold text-emerald-800">Approved by J. Davies</div>
                  <div className="text-xs text-emerald-600 mt-0.5">VP Operations · Ref: APP-2025-0042 · Logged &amp; audit-trailed</div>
                </div>
              </motion.div>
            )}
            <div className="mt-2.5 text-xs text-center text-gray-400">
              All approvals are logged, versioned, and audit-trailed.
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
}