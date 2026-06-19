import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  AlertCircle, RefreshCw, Activity, Users, AlertTriangle, TrendingUp,
  CheckCircle2, Circle, ListChecks, ArrowRight, ChevronDown, ChevronUp,
  FileSpreadsheet, Printer, BookOpen,
} from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard, downloadVerificationExcel } from '../api/rccp'
import type { Batch, RCCPLine, RCCPPortfolioChange, RCCPPoolRoleBalance } from '../types'
import { C, focusMonthPeriod, monthLabel, rollingMonths, HIDDEN_LINE_CODES, sortLinesByCode, poolFteForMonth, poolFteHorizon } from '../components/rccp/brand'
import NextMonthSpotlight from '../components/rccp/NextMonthSpotlight'
import PortfolioPanel from '../components/rccp/PortfolioPanel'
import PoolLabourPanel from '../components/rccp/PoolLabourPanel'
import KPITile from '../components/rccp/KPITile'
import PlantChart, { formatLarge } from '../components/rccp/PlantChart'
import {
  type ActionItem, COGS_PER_LITRE, fmtGBP, loadActionStatus, saveActionStatus,
  buildActionItems, buildHeadline,
} from '../components/rccp/execInsights'

type UnitMode = 'L' | 'h'

// Action items, headline + cost helpers now live in components/rccp/execInsights.ts
// (shared with the slim Executive Summary).

function ActionItemsCard({
  batchId, items,
}: {
  batchId: number
  items: ActionItem[]
}) {
  const [status, setStatus] = useState<Record<string, 'done' | 'pending'>>(() => loadActionStatus(batchId))
  // Re-load when batch changes (different cycle = different store)
  useEffect(() => { setStatus(loadActionStatus(batchId)) }, [batchId])

  function toggle(id: string) {
    setStatus(prev => {
      const next = { ...prev, [id]: prev[id] === 'done' ? 'pending' : 'done' } as Record<string, 'done' | 'pending'>
      saveActionStatus(batchId, next)
      return next
    })
  }

  const pendingCount = items.filter(i => status[i.id] !== 'done').length

  if (items.length === 0) {
    return (
      <div
        className="rounded-2xl px-5 py-5 flex items-start gap-3"
        style={{ background: C.limeTint, border: `1px solid ${C.lime}55` }}
      >
        <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={2.2} style={{ color: C.limeDeep }} />
        <div>
          <p className="text-[14px] font-semibold" style={{ color: C.limeDeep }}>No actions outstanding</p>
          <p className="text-[12.5px] mt-1" style={{ color: C.ink2 }}>
            Order book covered, no material labour gaps, no new launches in the next 3 months. Sign off when ready.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl px-5 py-5" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            <ListChecks className="w-4 h-4" style={{ color: C.lime }} />
            Talking points &amp; actions
          </h2>
          <p className="text-[12px] mt-1 ml-[34px]" style={{ color: C.ink3 }}>
            Auto-generated from this batch. Tick items as decisions land in the meeting.
          </p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-md"
          style={pendingCount > 0
            ? { background: C.amberLight, color: C.amber, border: `1px solid ${C.amber}33` }
            : { background: C.limeTint, color: C.limeDeep, border: `1px solid ${C.lime}55` }}
        >
          {pendingCount === 0
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> all done</>
            : <><AlertTriangle className="w-3.5 h-3.5" /> {pendingCount} of {items.length} pending</>}
        </span>
      </div>

      <ul className="space-y-1.5">
        {items.map(item => {
          const done = status[item.id] === 'done'
          const sev = item.severity
          const sevColor = sev === 'critical' ? C.red : sev === 'high' ? C.amber : C.ink3
          const catLabel = item.category === 'CAPACITY' ? 'CAPACITY' : item.category === 'LABOUR' ? 'LABOUR' : 'PORTFOLIO'
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors"
              style={{
                background: done ? '#FAFAF9' : '#fff',
                border: `1px solid ${C.border}`,
                opacity: done ? 0.6 : 1,
              }}
            >
              <button
                onClick={() => toggle(item.id)}
                className="flex-shrink-0 mt-0.5 transition-colors"
                style={{ color: done ? C.limeDeep : C.ink4 }}
                title={done ? 'Mark as pending' : 'Mark as done'}
              >
                {done ? <CheckCircle2 className="w-4 h-4" strokeWidth={2.2} /> : <Circle className="w-4 h-4" strokeWidth={2} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="font-mono text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-px rounded"
                    style={{ background: '#F1F2F4', color: sevColor }}
                  >
                    {catLabel}
                  </span>
                  <span
                    className="text-[13.5px] font-semibold"
                    style={{ color: done ? C.ink3 : C.navy, textDecoration: done ? 'line-through' : 'none' }}
                  >
                    {item.title}
                  </span>
                </div>
                <p className="text-[11.5px] mt-0.5" style={{ color: C.ink3 }}>{item.detail}</p>
              </div>
              {item.cost != null && item.cost > 0 && (
                <span
                  className="flex-shrink-0 font-mono text-[12px] font-semibold tabnum px-2 py-1 rounded"
                  style={{ color: C.navy, background: C.navyTint, border: `1px solid ${C.border}` }}
                  title="Cost = extra litres × £0.12/L"
                >
                  ≈ {fmtGBP(item.cost)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ExecutiveSummaryV2Page() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [unitMode, setUnitMode] = useState<UnitMode>('L')
  const [showOutlook, setShowOutlook] = useState(false)
  const [showDefinitions, setShowDefinitions] = useState(false)
  const [downloadingXlsx, setDownloadingXlsx] = useState(false)

  async function handleDownloadXlsx() {
    if (selectedBatchId === null) return
    setDownloadingXlsx(true)
    try {
      await downloadVerificationExcel(selectedBatchId)
    } catch (e) {
      console.error('Failed to download verification workbook', e)
    } finally {
      setDownloadingXlsx(false)
    }
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

  // Group lines by plant for the per-plant charts
  const plantsByCode = useMemo(() => {
    const map = new Map<string, RCCPLine[]>()
    for (const l of allLines) {
      if (!map.has(l.plant_code)) map.set(l.plant_code, [])
      map.get(l.plant_code)!.push(l)
    }
    return Array.from(map.entries()).sort()
  }, [allLines])

  // Launches grouped by plant × period for chart markers
  const launchesByPlant = useMemo(() => {
    const map: Record<string, Record<string, RCCPPortfolioChange[]>> = {}
    const lineToPlant = new Map(allLines.map(l => [l.line_code, l.plant_code]))
    for (const pc of dashboard?.portfolio_changes ?? []) {
      if (pc.change_type !== 'NEW_LAUNCH') continue
      if (!pc.effective_period || !pc.line_code) continue
      const plant = lineToPlant.get(pc.line_code)
      if (!plant) continue
      if (!map[plant]) map[plant] = {}
      if (!map[plant][pc.effective_period]) map[plant][pc.effective_period] = []
      map[plant][pc.effective_period].push(pc)
    }
    return map
  }, [dashboard, allLines])

  // All-plants launch markers
  const launchesAllPlants = useMemo(() => {
    const map: Record<string, RCCPPortfolioChange[]> = {}
    for (const pc of dashboard?.portfolio_changes ?? []) {
      if (pc.change_type !== 'NEW_LAUNCH') continue
      if (!pc.effective_period) continue
      if (!map[pc.effective_period]) map[pc.effective_period] = []
      map[pc.effective_period].push(pc)
    }
    return map
  }, [dashboard])

  const focus = dashboard ? focusMonthPeriod(dashboard.plan_cycle_date) : null
  const horizon = dashboard ? rollingMonths(dashboard.plan_cycle_date, 12) : []

  // Pool labour across the 12-month horizon — for the outlook tile (consistent with the spotlight)
  const fteHorizon = useMemo(
    () => dashboard
      ? poolFteHorizon(dashboard.pool_labour ?? {}, horizon)
      : null,
    [dashboard, horizon],
  )

  // Headline stats — 12-month, mix-weighted (sums, not averaged percentages)
  const headline = useMemo(
    () => buildHeadline(allLines, horizon, dashboard?.pool_labour ?? {}),
    [allLines, horizon, dashboard],
  )
  const actionItems = useMemo(
    () => dashboard
      ? buildActionItems(allLines, dashboard.portfolio_changes ?? [], dashboard.plan_cycle_date, dashboard.pool_labour ?? {})
      : [],
    [allLines, dashboard],
  )

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some(b => b.status === 'PUBLISHED')

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
            Capacity Dashboard
          </h1>
          <p className="mt-2 text-[13.5px] max-w-[700px] leading-relaxed" style={{ color: C.ink2 }}>
            Planning month first, action items next, then the underlying data. Everything below the actions is supporting detail.
          </p>
        </div>

        {/* Download / Export buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
          {selectedBatchId !== null && (
            <button
              onClick={handleDownloadXlsx}
              disabled={downloadingXlsx}
              title="Download the S&OP verification workbook (capacity vs volumes, per line × month)"
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
            title="Print or Save as PDF"
          >
            <Printer className="w-3 h-3" />
            Export PDF
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

      {dashboard && !isLoading && focus && (
        <>
          {/* Plant / unit controls */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}
            className="mt-5 flex items-center gap-3 flex-wrap"
          >
            <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: C.ink3 }}>
              Plan cycle · {monthLabel(dashboard.plan_cycle_date.slice(0, 7))}
            </span>
            <span style={{ color: C.ink4 }}>·</span>
            <div className="inline-flex rounded-md overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <button
                onClick={() => setUnitMode('L')}
                className="px-2.5 py-1 text-[12px] font-semibold transition-all"
                style={unitMode === 'L'
                  ? { background: C.navy, color: '#fff' }
                  : { background: '#fff', color: C.ink3 }}
              >
                Litres
              </button>
              <button
                onClick={() => setUnitMode('h')}
                className="px-2.5 py-1 text-[12px] font-semibold transition-all"
                style={unitMode === 'h'
                  ? { background: C.navy, color: '#fff' }
                  : { background: '#fff', color: C.ink3, borderLeft: `1px solid ${C.border}` }}
              >
                Hours
              </button>
            </div>
          </motion.div>

          {/* 1. Planning-month spotlight (FIRST) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="mt-5"
          >
            <NextMonthSpotlight
              lines={allLines}
              planCycleDate={dashboard.plan_cycle_date}
              poolLabour={dashboard.pool_labour ?? {}}
              cogsPerLitre={dashboard.settings?.cogs_opex_per_litre ?? 0.12}
            />
          </motion.div>

          {/* 2. Talking points & actions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}
            className="mt-4"
          >
            <ActionItemsCard batchId={dashboard.batch_id} items={actionItems} />
          </motion.div>

          {/* 3. All-plants aggregate chart */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="mt-4"
          >
            <PlantChart
              title="All plants · Capacity vs Actuals"
              subtitle={`${allLines.length} lines across ${plantsByCode.length} plants — site totals`}
              lines={allLines}
              planCycleDate={dashboard.plan_cycle_date}
              unitMode={unitMode}
              launchesByPeriod={launchesAllPlants}
              headerMetricLabel="12-month site capacity"
            />
          </motion.div>

          {/* 4. Per-plant breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4"
          >
            {plantsByCode.map(([plant, lines]) => (
              <PlantChart
                key={plant}
                title={`${plant} · Capacity vs Actuals`}
                lines={lines}
                planCycleDate={dashboard.plan_cycle_date}
                unitMode={unitMode}
                launchesByPeriod={launchesByPlant[plant]}
              />
            ))}
          </motion.div>

          {/* 4b. Staffing feasibility — pool labour balance */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.19 }}
            className="mt-4"
          >
            <PoolLabourPanel poolLabour={dashboard.pool_labour ?? {}} poolInfo={dashboard.pool_info ?? {}} horizon={horizon} />
          </motion.div>

          {/* 5. Portfolio changes — monthly volume/hours impact (informational) */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.205 }}
            className="mt-4"
          >
            <PortfolioPanel
              changes={dashboard.portfolio_changes ?? []}
              lines={allLines}
              horizon={horizon}
              unitMode={unitMode}
            />
          </motion.div>

          {/* 6. 12-month outlook — collapsed by default, lives at the bottom */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}
            className="mt-4 rounded-2xl bg-white" style={{ border: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => setShowOutlook(s => !s)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAFAF9]"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.ink4 }} />
                <span className="font-semibold text-[14px]" style={{ color: C.navy }}>
                  12-month outlook
                </span>
                <span className="font-mono text-[10.5px]" style={{ color: C.ink4 }}>
                  {monthLabel(horizon[0])} → {monthLabel(horizon[horizon.length - 1])}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px]" style={{ color: C.ink3 }}>
                  plan feasibility {headline.planFeasibility ?? '—'}{headline.planFeasibility != null ? '%' : ''} · demand cov {headline.demandCoverage ?? '—'}{headline.demandCoverage != null ? '%' : ''}
                  {fteHorizon?.avgGap != null && fteHorizon.avgGap > 0 && (
                    <> · pool short −{fteHorizon.avgGap.toFixed(1)} FTE/mo</>
                  )}
                </span>
                {showOutlook ? <ChevronUp className="w-4 h-4" style={{ color: C.ink3 }} /> : <ChevronDown className="w-4 h-4" style={{ color: C.ink3 }} />}
              </div>
            </button>
            {showOutlook && (
              <>
                <div className="px-5 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <KPITile
                    tone={headline.linesAtRisk > 0 ? 'warn' : 'lime'}
                    icon={AlertTriangle}
                    label="Lines at risk"
                    value={headline.linesAtRisk}
                    footnote={`${headline.criticalLines} critical · ${headline.highLines} high`}
                  />
                  <KPITile
                    tone={headline.planFeasibility != null && headline.planFeasibility < 90 ? 'warn'
                      : headline.planFeasibility != null && headline.planFeasibility < 100 ? 'warn'
                      : 'lime'}
                    icon={Activity}
                    label="Plan feasibility"
                    value={headline.planFeasibility ?? '—'}
                    suffix={headline.planFeasibility != null ? '%' : ''}
                    footnote={headline.productionTotal > 0
                      ? (headline.shortfallLitres > 0
                        ? `${formatLarge(headline.deliverableLitres, 'L')} of ${formatLarge(headline.productionTotal, 'L')} deliverable`
                        : `${formatLarge(headline.productionTotal, 'L')} fits in capacity`)
                      : 'no plan to assess'}
                  />
                  <KPITile
                    tone={headline.demandCoverage != null && headline.demandCoverage > 100 ? 'warn' : 'navy'}
                    icon={TrendingUp}
                    label="Demand vs capacity"
                    value={headline.demandCoverage ?? '—'}
                    suffix={headline.demandCoverage != null ? '%' : ''}
                    footnote={`${formatLarge(headline.demandTotal, 'L')} S&OP demand`}
                  />
                  <KPITile
                    tone={fteHorizon && fteHorizon.monthsShort > 0 ? 'warn'
                      : fteHorizon && fteHorizon.hasHave ? 'lime'
                      : 'navy'}
                    icon={Users}
                    label="Pool headcount (12-mo avg)"
                    value={fteHorizon && fteHorizon.avgHave != null ? fteHorizon.avgHave.toFixed(0) : '—'}
                    suffix={fteHorizon && fteHorizon.avgHave != null ? ' FTE' : ''}
                    footnote={fteHorizon && fteHorizon.hasHave
                      ? (fteHorizon.monthsShort > 0
                        ? `avg need ${fteHorizon.avgNeed?.toFixed(1) ?? '—'} · ${fteHorizon.monthsShort} of ${fteHorizon.totalMonths} mo short (peak −${fteHorizon.peakGap.toFixed(1)})`
                        : `avg need ${fteHorizon.avgNeed?.toFixed(1) ?? '—'} FTE · covers demand all ${fteHorizon.totalMonths} months`)
                      : 'no pool headcount entered'}
                  />
                </div>
                {(headline.shortfallLitres > 0 || headline.siteUtilTheoretical != null) && (
                  <p className="px-5 pb-4 text-[11px] flex items-center gap-2 flex-wrap" style={{ color: C.ink4 }}>
                    {headline.shortfallLitres > 0 && (
                      <span>
                        Shortfall <span className="font-mono font-semibold tabnum" style={{ color: C.amber }}>{formatLarge(headline.shortfallLitres, 'L')}</span> over 12 months — needs OT or extra shifts to clear.
                      </span>
                    )}
                    {headline.siteUtilTheoretical != null && headline.theoreticalCapacity != null && (
                      <span>
                        {headline.shortfallLitres > 0 && <span style={{ color: C.ink4 }}>·</span>}{' '}
                        Theoretical capacity used <span className="font-mono font-semibold tabnum" style={{ color: C.ink3 }}>{headline.siteUtilTheoretical}%</span> ({formatLarge(headline.productionTotal, 'L')} of {formatLarge(headline.theoreticalCapacity, 'L')} raw, if mix could rebalance).
                      </span>
                    )}
                  </p>
                )}
              </>
            )}
          </motion.div>

          {/* 7. Definitions — collapsed by default; shows in print */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}
            className="mt-4 rounded-2xl bg-white" style={{ border: `1px solid ${C.border}` }}
          >
            <button
              onClick={() => setShowDefinitions(s => !s)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAFAF9] print:hidden"
            >
              <div className="flex items-center gap-2.5">
                <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
                <BookOpen className="w-4 h-4" style={{ color: C.navy }} />
                <span className="font-semibold text-[14px]" style={{ color: C.navy }}>
                  Definitions
                </span>
                <span className="font-mono text-[10.5px]" style={{ color: C.ink4 }}>
                  glossary of the metrics shown on this page
                </span>
              </div>
              {showDefinitions ? <ChevronUp className="w-4 h-4" style={{ color: C.ink3 }} /> : <ChevronDown className="w-4 h-4" style={{ color: C.ink3 }} />}
            </button>
            <div className={`px-5 pb-5 pt-2 ${showDefinitions ? '' : 'hidden print:block'}`}>
              <h3 className="hidden print:flex text-[14px] font-semibold items-center gap-2 mb-3" style={{ color: C.navy }}>
                <BookOpen className="w-4 h-4" /> Definitions
              </h3>
              <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    {
                      term: 'Production plan',
                      def: 'Total volume the site has committed to make this month — the sum of firm (YPAC, released) and MRP-proposed (LA, planned) production orders from SAP. Expressed in litres.',
                    },
                    {
                      term: 'Site capacity (theoretical)',
                      def: 'The raw site ceiling — Σ available capacity across all lines using each line\'s weighted-mix L/min × OEE baseline × calendar hours. The figure assumes mix could rebalance freely across lines, so it overstates what\'s actually achievable with current orders.',
                    },
                    {
                      term: 'Plan feasibility',
                      def: 'Percentage of the production plan that fits in current per-line capacity: Σ min(production, available) ÷ Σ production. 100% means the plan can be made as-is. Below 100% means some demand needs OT, an extra shift, or to be rescheduled.',
                    },
                    {
                      term: 'Volume to clear',
                      def: 'The litres of production that exceed current capacity — what would have to be made via overtime or an extra shift. Cost = volume × £0.12/L (COGS OPEX). Editable on Settings.',
                    },
                    {
                      term: 'FTE — full-time equivalent',
                      def: 'One person working a standard month. For this period: working days × shift hours (calendar-derived, e.g. 22 × 7h = 154h). 1 FTE could be one full-time person, two part-timers, or one person with overtime. Captures partial-month operation that head-counts hide.',
                    },
                    {
                      term: 'Headcount need vs plan',
                      def: 'Need = (line production hours × per-line crew) + (plant requirement × plant operating hours), divided by FTE-month-hours. Plan = sum of planned headcount from the headcount_plan file. Gap = need − plan (positive = short).',
                    },
                    {
                      term: 'Lines at risk',
                      def: 'Lines that are Critical (utilisation > 100% in any month — capacity-constrained) or High (utilisation > 90% OR a material ≥1 FTE labour gap). Risk is capacity-led; fractional staffing gaps don\'t escalate to Critical.',
                    },
                    {
                      term: 'Demand vs capacity (S&OP)',
                      def: 'Forward-looking comparison of S&OP demand forecast (from the demand_plan / PIR upload) against theoretical site capacity. Above 100% means the longer-term forecast doesn\'t fit — informs capital / hiring conversations.',
                    },
                    {
                      term: 'Material labour shortfall',
                      def: 'A line with a planned headcount gap of ≥ 1 FTE-month — flagged because rosters can\'t fill a fractional gap. Sub-1 FTE gaps stay visible in the People Fit detail but don\'t escalate the line\'s risk status.',
                    },
                    {
                      term: 'Talking points / actions',
                      def: 'Auto-generated decisions for the RCCP meeting: lines needing extra hours, plants short on people, new launches landing in the next 3 months. Status (pending / done) persists per batch — tick items as decisions land.',
                    },
                    {
                      term: 'Firm orders (YPAC)',
                      def: 'SAP-released production orders that are confirmed and committed to be made — counted into "Production plan".',
                    },
                    {
                      term: 'MRP proposals (LA)',
                      def: 'SAP planned orders generated by MRP based on demand. Not yet released but expected to be — counted into "Production plan" as the propose-to-make figure.',
                    },
                    {
                      term: 'OEE — overall equipment effectiveness',
                      def: 'Line-level baseline running efficiency (default 55%, editable per line on Settings). All capacity figures use the line\'s OEE target.',
                    },
                    {
                      term: 'Working days · shift hours',
                      def: 'Working days come from the line_capacity_calendar (per line per day, bank holidays / shutdowns excluded). Shift hours come from each line\'s available_mins_per_day (default 420 min = 7h). Together they define the per-line operating envelope.',
                    },
                  ].map(d => (
                    <div key={d.term}>
                      <dt className="text-[13px] font-semibold" style={{ color: C.navy }}>{d.term}</dt>
                      <dd className="text-[12px] mt-0.5 leading-relaxed" style={{ color: C.ink2 }}>{d.def}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </motion.div>

          {/* Footer */}
          <p className="mt-8 pt-5 text-[11.5px] text-center flex items-center justify-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.border}`, color: C.ink3 }}>
            <span className="font-bold tracking-tight" style={{ color: C.navy }}>moove</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>RCCP One · Exec Summary v2</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Gravesend UKP1</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Plan cycle {monthLabel(dashboard.plan_cycle_date.slice(0, 7))}</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span className="inline-flex items-center gap-1">Cost basis £0.12/L <ArrowRight className="w-3 h-3" /> extra litres</span>
          </p>
        </>
      )}
    </div>
  )
}
