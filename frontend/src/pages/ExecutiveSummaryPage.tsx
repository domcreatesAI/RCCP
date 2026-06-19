import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import {
  AlertCircle, RefreshCw, Activity, Users, Package, AlertTriangle,
  CheckCircle2, ArrowRight, FileSpreadsheet, Printer, Factory,
} from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard, downloadVerificationExcel } from '../api/rccp'
import type { Batch } from '../types'
import { C, monthLabel, rollingMonths, HIDDEN_LINE_CODES, sortLinesByCode } from '../components/rccp/brand'
import { formatLarge } from '../components/rccp/PlantChart'
import KPITile, { type KPITileTone } from '../components/rccp/KPITile'
import MrpVsCapacityChart from '../components/rccp/MrpVsCapacityChart'
import NextMonthSpotlight from '../components/rccp/NextMonthSpotlight'
import {
  buildExecKpis, buildActionItems, fmtGBP, type ExecVerdict, type UnitMode,
} from '../components/rccp/execInsights'

const VERDICT: Record<ExecVerdict, { label: string; bg: string; border: string; fg: string; dot: string }> = {
  ON_PLAN: { label: 'On plan',       bg: C.limeTint,  border: `${C.lime}66`, fg: C.limeDeep, dot: C.lime },
  AT_RISK: { label: 'At risk',       bg: C.amberLight, border: '#FCD34D',     fg: C.amber,    dot: C.amber },
  ACTION:  { label: 'Action needed', bg: C.redLight,  border: '#FCA5A5',     fg: C.red,      dot: C.red },
}

export default function ExecutiveSummaryPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [unitMode, setUnitMode] = useState<UnitMode>('L')
  const [downloadingXlsx, setDownloadingXlsx] = useState(false)

  async function handleDownloadXlsx() {
    if (selectedBatchId === null) return
    setDownloadingXlsx(true)
    try { await downloadVerificationExcel(selectedBatchId) }
    catch (e) { console.error('Failed to download verification workbook', e) }
    finally { setDownloadingXlsx(false) }
  }

  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: listBatches })
  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      const pub = batches.find((b: Batch) => b.status === 'PUBLISHED')
      if (pub) setSelectedBatchId(pub.batch_id)
    }
  }, [batches, selectedBatchId])

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['rccp-dashboard', selectedBatchId],
    queryFn: () => getDashboard(selectedBatchId!),
    enabled: selectedBatchId !== null,
    staleTime: 5 * 60 * 1000,
  })

  const allLines = useMemo(
    () => sortLinesByCode((dashboard?.lines ?? []).filter(l => !HIDDEN_LINE_CODES.includes(l.line_code))),
    [dashboard],
  )

  const horizon = useMemo(
    () => dashboard ? rollingMonths(dashboard.plan_cycle_date, 12) : [],
    [dashboard],
  )

  const kpis = useMemo(
    () => dashboard
      ? buildExecKpis(allLines, horizon, unitMode, dashboard.pool_labour ?? {}, dashboard.portfolio_changes ?? [])
      : null,
    [allLines, horizon, unitMode, dashboard],
  )

  const decisions = useMemo(
    () => dashboard
      ? buildActionItems(allLines, dashboard.portfolio_changes ?? [], dashboard.plan_cycle_date, dashboard.pool_labour ?? {})
      : [],
    [allLines, dashboard],
  )

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some(b => b.status === 'PUBLISHED')

  // One-line narrative from the KPIs.
  function narrative(k: NonNullable<typeof kpis>): string {
    const parts: string[] = []
    if (k.linesOver > 0) parts.push(`Plan exceeds capacity on ${k.linesOver} line${k.linesOver > 1 ? 's' : ''}${k.overMonthsLabel ? ` (${k.overMonthsLabel})` : ''}`)
    if (k.poolsShort > 0) parts.push(`${k.poolsShort} pool${k.poolsShort > 1 ? 's' : ''} short ~${k.fteGap} FTE${k.poolShortFrom ? ` from ${monthLabel(k.poolShortFrom)}` : ''}`)
    if (k.phaseInCount > 0) parts.push(`${k.phaseInCount} phase-in${k.phaseInCount > 1 ? 's' : ''}${k.phaseInFrom ? ` from ${monthLabel(k.phaseInFrom)}` : ''}`)
    if (parts.length === 0) return `Plan fits within capacity and the pools cover the crew need across the next 12 months.${k.peakUtilPct != null ? ` Peak utilisation ${k.peakUtilPct}%.` : ''}`
    return parts.join(' · ') + '.'
  }

  return (
    <div className="px-7 py-6 pb-16" style={{ color: C.ink }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1 className="font-semibold flex items-center gap-3 flex-wrap" style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            <span className="inline-block rounded" style={{ width: 5, height: 30, background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`, boxShadow: '0 0 10px rgba(170,205,0,0.4)' }} />
            Executive Summary
          </h1>
          <p className="mt-2 text-[13.5px] max-w-[640px] leading-relaxed" style={{ color: C.ink2 }}>
            Can we execute the plan over the next 12 months — and what needs a decision.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
          <Link
            to="/capacity-dashboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[12.5px] font-medium transition-colors hover:bg-[#FAFAF9]"
            style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
          >
            Full dashboard <ArrowRight className="w-3 h-3" />
          </Link>
          {selectedBatchId !== null && (
            <button
              onClick={handleDownloadXlsx}
              disabled={downloadingXlsx}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[12.5px] font-medium transition-colors disabled:opacity-50 hover:bg-[#FAFAF9]"
              style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
            >
              <FileSpreadsheet className={`w-3 h-3 ${downloadingXlsx ? 'animate-pulse' : ''}`} style={{ color: C.limeDeep }} />
              {downloadingXlsx ? 'Preparing…' : 'Excel'}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium text-white transition-colors hover:opacity-90"
            style={{ background: C.navy }}
          >
            <Printer className="w-3 h-3" /> Export PDF
          </button>
        </div>
      </motion.div>

      {hasNoPublished && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.amberLight, border: '1px solid #FCD34D' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.amber }} />
          <p className="text-[13px]" style={{ color: C.amber }}>Publish a batch on the Planning Data page to populate this view.</p>
        </div>
      )}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} /> Loading…
          </div>
        </div>
      )}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>{(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(error)}</p>
        </div>
      )}

      {dashboard && kpis && !isLoading && (
        <>
          {/* Plan cycle + unit toggle */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
            className="mt-5 flex items-center gap-3 flex-wrap"
          >
            <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: C.ink3 }}>
              Plan cycle · {monthLabel(dashboard.plan_cycle_date.slice(0, 7))}
            </span>
            <span style={{ color: C.ink4 }}>·</span>
            <div className="inline-flex rounded-md overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <button onClick={() => setUnitMode('L')} className="px-2.5 py-1 text-[12px] font-semibold transition-all"
                style={unitMode === 'L' ? { background: C.navy, color: '#fff' } : { background: '#fff', color: C.ink3 }}>Litres</button>
              <button onClick={() => setUnitMode('h')} className="px-2.5 py-1 text-[12px] font-semibold transition-all"
                style={unitMode === 'h' ? { background: C.navy, color: '#fff' } : { background: '#fff', color: C.ink3, borderLeft: `1px solid ${C.border}` }}>Hours</button>
            </div>
          </motion.div>

          {/* Next month spotlight */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.045 }}
            className="mt-4"
          >
            <NextMonthSpotlight
              lines={allLines}
              planCycleDate={dashboard.plan_cycle_date}
              poolLabour={dashboard.pool_labour ?? {}}
              cogsPerLitre={dashboard.settings?.cogs_opex_per_litre ?? 0.12}
            />
          </motion.div>

          {/* 12-month outlook section label */}
          <div className="mt-6 mb-1 ml-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.ink4 }}>
            Next 12 months
          </div>

          {/* Verdict band */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="mt-1 rounded-2xl px-5 py-4 flex items-start gap-3.5"
            style={{ background: VERDICT[kpis.verdict].bg, border: `1px solid ${VERDICT[kpis.verdict].border}` }}
          >
            <span className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md flex-shrink-0 mt-0.5"
              style={{ background: '#fff', color: VERDICT[kpis.verdict].fg, border: `1px solid ${VERDICT[kpis.verdict].border}` }}>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: VERDICT[kpis.verdict].dot }} />
              {VERDICT[kpis.verdict].label}
            </span>
            <p className="text-[14px] leading-relaxed" style={{ color: C.ink }}>{narrative(kpis)}</p>
          </motion.div>

          {/* KPI tiles */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <KPITile
              label="Can we make it" icon={Factory}
              value={`${kpis.linesOver}/${allLines.length}`}
              tone={(kpis.linesOver > 0 ? 'warn' : 'lime') as KPITileTone}
              footnote={kpis.linesOver > 0 ? `lines over capacity${kpis.overMonthsLabel ? ` · ${kpis.overMonthsLabel}` : ''}` : 'all lines within capacity'}
            />
            <KPITile
              label="Plan feasibility" icon={Activity}
              value={kpis.planFeasibilityPct != null ? kpis.planFeasibilityPct : '—'} suffix={kpis.planFeasibilityPct != null ? '%' : ''}
              tone={((kpis.planFeasibilityPct ?? 100) < 100 ? 'warn' : 'lime') as KPITileTone}
              footnote={kpis.siteUtilPct != null
                ? `of plan fits capacity · site util ${kpis.siteUtilPct}%${kpis.peakUtilPct != null ? ` (peak ${kpis.peakUtilPct}%)` : ''}`
                : 'of plan fits within capacity'}
            />
            <KPITile
              label="People" icon={Users}
              value={kpis.poolsShort}
              tone={(kpis.poolsShort > 0 ? 'warn' : 'lime') as KPITileTone}
              footnote={kpis.poolsShort > 0 ? `pool${kpis.poolsShort > 1 ? 's' : ''} short ~${kpis.fteGap} FTE${kpis.poolShortFrom ? ` · from ${monthLabel(kpis.poolShortFrom)}` : ''}` : 'pools cover the plan'}
            />
            <KPITile
              label="What's changing" icon={Package}
              value={kpis.phaseInCount}
              tone={'navy' as KPITileTone}
              footnote={kpis.phaseInCount > 0 ? `phase-ins · +${formatLarge(kpis.phaseInVolume, unitMode)}${kpis.phaseInFrom ? ` from ${monthLabel(kpis.phaseInFrom)}` : ''}` : 'no phase-ins this cycle'}
            />
          </motion.div>

          {/* Hero — MRP vs capacity */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="mt-4"
          >
            <MrpVsCapacityChart lines={allLines} planCycleDate={dashboard.plan_cycle_date} unitMode={unitMode} />
          </motion.div>

          {/* Decisions needed */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="mt-4 bg-white rounded-2xl px-5 py-5 print-avoid-break"
            style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}
          >
            <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
              <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
                <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
                Decisions needed {decisions.length > 0 && <span className="text-[12px] font-normal" style={{ color: C.ink3 }}>· top {Math.min(3, decisions.length)} of {decisions.length}</span>}
              </h2>
              {decisions.length > 0 && (
                <Link to="/capacity-dashboard" className="inline-flex items-center gap-1 text-[12px] font-semibold print:hidden" style={{ color: C.navy }}>
                  View all actions &amp; detail <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            {decisions.length === 0 ? (
              <div className="flex items-start gap-3 py-3">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={2.2} style={{ color: C.limeDeep }} />
                <p className="text-[13px]" style={{ color: C.ink2 }}>No decisions outstanding — order book covered, no material labour gaps, no imminent launches. Sign off when ready.</p>
              </div>
            ) : (
              <ul className="space-y-1.5 mt-1">
                {decisions.slice(0, 3).map(item => {
                  const sevColor = item.severity === 'critical' ? C.red : item.severity === 'high' ? C.amber : C.ink3
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                      <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-px rounded mt-0.5 flex-shrink-0"
                        style={{ background: '#F1F2F4', color: sevColor }}>{item.category}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold" style={{ color: C.navy }}>{item.title}</p>
                        <p className="text-[11.5px] mt-0.5" style={{ color: C.ink3 }}>{item.detail}</p>
                      </div>
                      {item.cost != null && item.cost > 0 && (
                        <span className="flex-shrink-0 font-mono text-[12px] font-semibold tabnum px-2 py-1 rounded"
                          style={{ color: C.navy, background: C.navyTint, border: `1px solid ${C.border}` }}>≈ {fmtGBP(item.cost)}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}
