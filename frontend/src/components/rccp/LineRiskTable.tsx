import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react'
import type { RCCPLine, RCCPMonthlyBucket, RCCPPlantSupportRole, UnitMode } from '../../types'
import PlantSupportPanel from './PlantSupportPanel'

interface Props {
  lines: RCCPLine[]
  unitMode: UnitMode
  visiblePeriods: string[]
  plantSupport: Record<string, RCCPPlantSupportRole[]>
}

type FilterKey = 'All' | 'Critical' | 'High' | 'Watch' | 'Stable' | 'No data'
type SortKey = 'risk_score' | 'utilisation' | 'gap'

const RISK_BG: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700 border-red-200',
  High: 'bg-orange-100 text-orange-700 border-orange-200',
  Watch: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  Stable: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'No data': 'bg-slate-100 text-slate-500 border-slate-200',
}

const RISK_BAR: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F97316',
  Watch: '#EAB308',
  Stable: '#22C55E',
  'No data': '#CBD5E1',
}

const LABOUR_PILL: Record<string, string> = {
  OK: 'text-emerald-700',
  SHORTFALL: 'text-red-600 font-bold',
  NO_DATA: 'text-gray-400',
}

function fmtL(v: number | null): string {
  if (v === null) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}

function fmtH(v: number | null): string {
  if (v === null) return '—'
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

function shortPeriod(p: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const month = parseInt(p.split('-')[1]) - 1
  return months[month] ?? p
}

// ── HeadcountPanel ─────────────────────────────────────────────────────────────

function HeadcountPanel({
  monthly, visiblePeriods, hcRoles,
}: {
  monthly: RCCPMonthlyBucket[]
  visiblePeriods: string[]
  hcRoles: import('../../types').RCCPHCRole[]
}) {
  const visible = monthly.filter(m => visiblePeriods.includes(m.period))
  const hasAnyHC = visible.some(m => m.hc_required !== null || m.hc_planned_avg !== null)

  const roleSummary = hcRoles.length
    ? `${hcRoles.reduce((s, r) => s + r.required, 0)} total/day: ${hcRoles.map(r => `${r.required} ${r.role_code}`).join(' · ')}`
    : null

  return (
    <div className="px-4 pb-4 space-y-2">
      {/* Title + role summary */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-600">Headcount</span>
        {roleSummary && (
          <span className="text-[11px] text-gray-400">{roleSummary}</span>
        )}
      </div>

      {/* Monthly planned vs required totals */}
      {hasAnyHC ? (
        <div className="overflow-x-auto">
          <table className="text-xs w-full min-w-max">
            <thead>
              <tr>
                <td className="py-0.5 pr-4 text-gray-400 font-semibold w-28" />
                {visible.map(m => (
                  <td key={m.period} className="py-0.5 px-2 text-center text-gray-400 font-semibold whitespace-nowrap">
                    {shortPeriod(m.period)}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-0.5 pr-4 text-gray-500">Required (total)</td>
                {visible.map(m => (
                  <td key={m.period} className="py-0.5 px-2 text-center tabular-nums text-gray-700">
                    {m.hc_required ?? '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-0.5 pr-4 text-gray-500">Planned avg</td>
                {visible.map(m => (
                  <td key={m.period} className="py-0.5 px-2 text-center tabular-nums text-gray-700">
                    {m.hc_planned_avg ?? '—'}
                  </td>
                ))}
              </tr>
              <tr className="border-t border-gray-100">
                <td className="py-1 pr-4 text-gray-600 font-semibold">Shortfall</td>
                {visible.map(m => (
                  <td key={m.period} className={`py-1 px-2 text-center tabular-nums font-semibold ${
                    m.hc_shortfall !== null && m.hc_shortfall > 0
                      ? 'text-red-600'
                      : 'text-emerald-600'
                  }`}>
                    {m.hc_shortfall !== null ? (m.hc_shortfall > 0 ? `−${m.hc_shortfall}` : '✓') : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-400">No headcount plan data for this line.</p>
      )}
    </div>
  )
}

// ── UtilBar ───────────────────────────────────────────────────────────────────

function UtilBar({ pct, status }: { pct: number | null; status: string }) {
  if (pct === null) return <span className="text-xs text-gray-400">—</span>
  const color = RISK_BAR[status] ?? '#CBD5E1'
  const clipped = Math.min(pct, 120)
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${(clipped / 120) * 100}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LineRiskTable({ lines, unitMode, visiblePeriods, plantSupport }: Props) {
  const [filter, setFilter] = useState<FilterKey>('All')
  const [sortKey, setSortKey] = useState<SortKey>('risk_score')
  const [sortAsc, setSortAsc] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const FILTERS: FilterKey[] = ['All', 'Critical', 'High', 'Watch', 'Stable', 'No data']
  const filtered = lines.filter((l) => filter === 'All' || l.risk_status === filter)

  const sorted = [...filtered].sort((a, b) => {
    let diff = 0
    if (sortKey === 'risk_score') {
      diff = a.risk_score - b.risk_score
    } else if (sortKey === 'utilisation') {
      const au = a.monthly.map(m => m.utilisation_pct ?? 0)
      const bu = b.monthly.map(m => m.utilisation_pct ?? 0)
      diff = Math.max(...au) - Math.max(...bu)
    } else if (sortKey === 'gap') {
      const gapField = (m: RCCPMonthlyBucket) =>
        unitMode === 'h' ? m.gap_hours : m.gap_litres
      const sumDeficit = (line: RCCPLine) => {
        const deficits = line.monthly.filter(m => gapField(m) !== null && gapField(m)! < 0)
        return deficits.length ? deficits.reduce((s, m) => s + gapField(m)!, 0) : 0
      }
      diff = sumDeficit(a) - sumDeficit(b)
    }
    return sortAsc ? diff : -diff
  })

  const filterCounts: Partial<Record<FilterKey, number>> = { All: lines.length }
  for (const l of lines) {
    filterCounts[l.risk_status as FilterKey] = (filterCounts[l.risk_status as FilterKey] ?? 0) + 1
  }

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 hover:text-gray-700 transition-colors whitespace-nowrap">
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? 'text-indigo-500' : 'text-gray-300'}`} />
    </button>
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Line Risk Assessment</h2>
          <p className="text-xs text-gray-400 mt-0.5">Click a row to expand monthly breakdown + headcount</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {FILTERS.map((f) => {
            const count = filterCounts[f] ?? 0
            if (f !== 'All' && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  filter === f
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {f} {count > 0 && <span className="opacity-70 ml-0.5">({count})</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead style={{ borderBottom: '1px solid #F1F5F9' }}>
          <tr>
            <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-6" />
            <th className="px-2 py-2.5 text-left text-xs font-semibold text-gray-500">Line</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Plant</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 min-w-[140px]">
              <SortBtn label="Utilisation" k="utilisation" />
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
              <SortBtn label={`Annual Gap (${unitMode})`} k="gap" />
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Labour</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Driver</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((line, idx) => {
            const isOpen = expanded.has(line.line_code)
            const peakUtil = Math.max(...line.monthly.map(m => m.utilisation_pct ?? 0), 0) || null
            const gapField = (m: RCCPMonthlyBucket) =>
              unitMode === 'h' ? m.gap_hours : m.gap_litres
            // Sum of all deficit months — matches the KPI "Total Annual Gap" definition
            const deficitMonths = line.monthly.filter(m => gapField(m) !== null && gapField(m)! < 0)
            const worstGap = deficitMonths.length
              ? deficitMonths.reduce((acc, m) => acc + gapField(m)!, 0)
              : null
            const worstGapFormatted = unitMode === 'h' ? fmtH(worstGap) : fmtL(worstGap)

            return (
              <>
                <motion.tr
                  key={line.line_code}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => toggleExpand(line.line_code)}
                  className="cursor-pointer hover:bg-gray-50/60 transition-colors border-b"
                  style={{ borderColor: '#F1F5F9' }}>

                  <td className="px-4 py-3 text-gray-400">
                    {isOpen
                      ? <ChevronDown className="w-3.5 h-3.5" />
                      : <ChevronRight className="w-3.5 h-3.5" />}
                  </td>
                  <td className="px-2 py-3">
                    <span className="font-mono text-xs font-bold text-gray-900">{line.line_code}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{line.plant_code}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${RISK_BG[line.risk_status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                      {line.risk_status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <UtilBar pct={peakUtil} status={line.risk_status} />
                  </td>
                  <td className={`px-3 py-3 text-xs font-semibold tabular-nums ${worstGap !== null && worstGap < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {worstGapFormatted}
                  </td>
                  <td className={`px-3 py-3 text-xs ${LABOUR_PILL[line.labour_status]}`}>
                    {line.labour_status === 'NO_DATA' ? '—' : line.labour_status}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{line.primary_driver}</td>
                </motion.tr>

                <AnimatePresence>
                  {isOpen && (
                    <motion.tr
                      key={`${line.line_code}-expand`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ borderColor: '#F1F5F9' }}
                      className="border-b">
                      <td colSpan={8} className="bg-gray-50/60 px-4">
                        <HeadcountPanel
                          monthly={line.monthly}
                          visiblePeriods={visiblePeriods}
                          hcRoles={line.hc_roles}
                        />
                        {(plantSupport[line.plant_code]?.length ?? 0) > 0 && (
                          <div className="border-t border-gray-100 mt-1">
                            <PlantSupportPanel
                              plantCode={line.plant_code}
                              roles={plantSupport[line.plant_code]}
                              visiblePeriods={visiblePeriods}
                            />
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            )
          })}

          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-5 py-8 text-center text-sm text-gray-400">
                No lines matching filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
