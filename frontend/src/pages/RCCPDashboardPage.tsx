import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, AlertCircle, Calendar } from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard } from '../api/rccp'
import KPITiles from '../components/rccp/KPITiles'
import CapacityChart from '../components/rccp/CapacityChart'
import LineRiskTable from '../components/rccp/LineRiskTable'
import type { Batch, UnitMode, PeriodSlice, WeekSlice, Granularity } from '../types'

function sliceMonths(horizon: string[], slice: PeriodSlice): string[] {
  const n = slice === '18M' ? 18 : slice === '12M' ? 12 : slice === '6M' ? 6 : 3
  return horizon.slice(0, n)
}

function sliceWeeks(horizon: string[], slice: WeekSlice): string[] {
  const n = slice === '12W' ? 12 : slice === '8W' ? 8 : 4
  return horizon.slice(0, n)
}

function formatCycleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function formatHorizonLabel(months: string[]): string {
  if (!months.length) return ''
  const fmt = (p: string) => {
    const [y, m] = p.split('-')
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${names[parseInt(m) - 1]} ${y}`
  }
  return `${fmt(months[0])}–${fmt(months[months.length - 1])}`
}

function PublishedBatchSelector({
  batches, selectedId, onSelect,
}: {
  batches: Batch[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const published = batches.filter((b) => b.status === 'PUBLISHED')
  if (published.length <= 1) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Batch:</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
      >
        {published.map((b) => (
          <option key={b.batch_id} value={b.batch_id}>
            {b.batch_name} — {new Date(b.plan_cycle_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function RCCPDashboardPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [unitMode, setUnitMode] = useState<UnitMode>('h')
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [periodSlice, setPeriodSlice] = useState<PeriodSlice>('3M')
  const [weekSlice, setWeekSlice] = useState<WeekSlice>('12W')
  const [selectedLines, setSelectedLines] = useState<string[]>([])

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: listBatches,
  })

  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      const published = batches.find((b) => b.status === 'PUBLISHED')
      if (published) setSelectedBatchId(published.batch_id)
    }
  }, [batches, selectedBatchId])

  const { data: dashboard, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['rccp-dashboard', selectedBatchId],
    queryFn: () => getDashboard(selectedBatchId!),
    enabled: selectedBatchId !== null,
    staleTime: 5 * 60 * 1000,
  })

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some((b) => b.status === 'PUBLISHED')
  const selectedBatch = batches.find((b) => b.batch_id === selectedBatchId)
  const batchStatus = selectedBatch?.status ?? 'DRAFT'
  const visiblePeriods = dashboard
    ? granularity === 'weekly'
      ? sliceWeeks(dashboard.horizon_weeks, weekSlice)
      : sliceMonths(dashboard.horizon_months, periodSlice)
    : []

  // Plant tabs derived from dashboard lines
  const activeLines = dashboard?.lines ?? []

  // kpiLines = activeLines filtered further by chart line selection (empty = all)
  const kpiLines = selectedLines.length === 0
    ? activeLines
    : activeLines.filter(l => selectedLines.includes(l.line_code))

  // KPIs always recomputed from the visible window (granularity + period slice + line filter)
  const activeKpis = (() => {
    if (!dashboard || !visiblePeriods.length) return dashboard?.kpis
    const periodSet = new Set(visiblePeriods)
    const getVisible = (l: typeof kpiLines[0]) => {
      const buckets = granularity === 'weekly' ? l.weekly : l.monthly
      return buckets.filter(m => periodSet.has(m.period))
    }
    const peaks = kpiLines.map(l => Math.max(...getVisible(l).map(m => m.utilisation_pct ?? 0), 0)).filter(v => v > 0)
    const overall_util = peaks.length ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length * 10) / 10 : null

    const deficits_l = kpiLines.flatMap(l => getVisible(l).filter(m => m.gap_litres !== null && m.gap_litres! < 0).map(m => m.gap_litres!))
    const deficits_h = kpiLines.flatMap(l => getVisible(l).filter(m => m.gap_hours  !== null && m.gap_hours!  < 0).map(m => m.gap_hours!))

    let peak_util: number | null = null, peak_period: string | null = null
    for (const l of kpiLines) for (const m of getVisible(l))
      if (m.utilisation_pct !== null && (peak_util === null || m.utilisation_pct > peak_util))
        { peak_util = m.utilisation_pct; peak_period = m.period }

    const critical_lines = kpiLines.filter(l => getVisible(l).some(m => (m.utilisation_pct ?? 0) > 100)).length
    const high_lines     = kpiLines.filter(l => {
      const bs = getVisible(l)
      return !bs.some(m => (m.utilisation_pct ?? 0) > 100) && bs.some(m => (m.utilisation_pct ?? 0) > 90)
    }).length

    return {
      critical_lines,
      high_lines,
      overall_utilisation_pct: overall_util,
      total_gap_litres: deficits_l.length ? deficits_l.reduce((a, b) => a + b, 0) : null,
      total_gap_hours:  deficits_h.length ? deficits_h.reduce((a, b) => a + b, 0) : null,
      lines_with_labour_shortfall: granularity === 'monthly'
        ? kpiLines.filter(l => l.monthly.filter(m => periodSet.has(m.period)).some(m => m.labour_status === 'SHORTFALL')).length
        : 0,
      lines_with_no_data: kpiLines.filter(l => getVisible(l).every(m => m.utilisation_pct === null)).length,
      peak_util_pct: peak_util,
      peak_util_period: peak_period,
    }
  })()

  const watchLines = (() => {
    if (!visiblePeriods.length) return 0
    const periodSet = new Set(visiblePeriods)
    const getVisible = (l: typeof kpiLines[0]) => {
      const buckets = granularity === 'weekly' ? l.weekly : l.monthly
      return buckets.filter(m => periodSet.has(m.period))
    }
    return kpiLines.filter(l => {
      const bs = getVisible(l)
      return !bs.some(m => (m.utilisation_pct ?? 0) > 90) && bs.some(m => (m.utilisation_pct ?? 0) > 75)
    }).length
  })()

  return (
    <div className="p-6 space-y-5" style={{ color: '#0F172A', minHeight: '100%' }}>

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}>

        {/* Breadcrumb */}
        <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
          <span>RCCP One</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600 font-medium">RCCP Dashboard</span>
        </div>

        {/* Title + controls row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">RCCP Dashboard</h1>
            <p className="text-xs text-gray-400 mt-1">
              Rough Cut Capacity Planning — 14 filling lines · Gravesend UKP1 · OEE baseline 55%
              {dashboard && ` · ${formatHorizonLabel(dashboard.horizon_months)}`}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0 flex-wrap justify-end">
            {/* Granularity toggle */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
              {(['monthly', 'weekly'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={`px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                    granularity === g
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  {g === 'monthly' ? 'Monthly' : 'Weekly'}
                </button>
              ))}
            </div>

            {/* Horizon slice — changes based on granularity */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
              {granularity === 'monthly'
                ? (['3M', '6M', '12M', '18M'] as PeriodSlice[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPeriodSlice(s)}
                      className={`px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                        periodSlice === s
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}>
                      {s}
                    </button>
                  ))
                : (['4W', '8W', '12W'] as WeekSlice[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setWeekSlice(s)}
                      className={`px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                        weekSlice === s
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}>
                      {s}
                    </button>
                  ))
              }
            </div>

            {/* Unit toggle */}
            <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs">
              {(['h', 'L'] as UnitMode[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnitMode(u)}
                  className={`px-3 py-1.5 font-semibold transition-colors ${
                    unitMode === u
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  {u === 'L' ? 'Litres' : 'Hours'}
                </button>
              ))}
            </div>

            {/* Cycle badge */}
            {dashboard && (
              <div className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-500">Cycle:</span>
                <span className="font-bold text-gray-800">{formatCycleDate(dashboard.plan_cycle_date)}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ml-0.5 ${
                  batchStatus === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>{batchStatus}</span>
              </div>
            )}

            <PublishedBatchSelector batches={batches} selectedId={selectedBatchId} onSelect={setSelectedBatchId} />

            {selectedBatchId !== null && (
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-40 text-gray-500 bg-white">
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Recalculating…' : 'Recalculate'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* No published batch */}
      {hasNoPublished && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">No published batch</p>
            <p className="text-xs text-amber-600 mt-0.5">
              The RCCP dashboard requires a published batch. Go to Planning Data, upload and validate the 6 SAP files, then publish.
            </p>
          </div>
        </motion.div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
            Computing RCCP…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-50 border border-red-200 rounded-2xl px-6 py-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Failed to compute dashboard</p>
            <p className="text-xs text-red-500 mt-0.5">
              {(error as any)?.response?.data?.detail ?? String(error)}
            </p>
          </div>
        </motion.div>
      )}


      {/* Dashboard content */}
      {dashboard && !isLoading && activeKpis && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}>
            <KPITiles
              kpis={activeKpis}
              unitMode={unitMode}
              watchLines={watchLines}
              granularity={granularity}
              periodLabel={granularity === 'weekly' ? weekSlice : periodSlice}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}>
            <CapacityChart
              lines={activeLines}
              unitMode={unitMode}
              granularity={granularity}
              visiblePeriods={visiblePeriods}
              selectedLines={selectedLines}
              onToggleLine={(code) => setSelectedLines(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
              onClearLines={() => setSelectedLines([])}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}>
            <LineRiskTable lines={activeLines} unitMode={unitMode} visiblePeriods={visiblePeriods} plantSupport={dashboard.plant_support_requirements} />
          </motion.div>

          {/* Unassigned orders */}
          {dashboard.unassigned_orders.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-bold text-amber-700 mb-1">
                {dashboard.unassigned_orders.length} unassigned order group{dashboard.unassigned_orders.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-600">
                These SKUs have no primary line assigned in sku_masterdata and are excluded from line utilisation calculations. Upload an updated sku_masterdata file with primary_line_code populated to include them.
              </p>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
