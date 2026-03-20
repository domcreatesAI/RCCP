
import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import type { RCCPLine, RCCPMonthlyBucket, RCCPWeeklyBucket, UnitMode, Granularity } from '../../types'

type AnyBucket = RCCPMonthlyBucket | RCCPWeeklyBucket

interface Props {
  lines: RCCPLine[]
  unitMode: UnitMode
  granularity: Granularity
  visiblePeriods: string[]
  selectedLines: string[]
  onToggleLine: (code: string) => void
  onClearLines: () => void
}

function fmtL(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(Math.round(v))
}

function fmtH(v: number): string {
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return String(Math.round(v))
}

function fmtVal(v: number, mode: UnitMode): string {
  return mode === 'h' ? fmtH(v) : fmtL(v)
}

function shortPeriod(p: string): string {
  if (p.includes('W')) {
    // "2026-W12" → "W12 '26"
    const [year, week] = p.split('-W')
    return `W${week} '${year.slice(2)}`
  }
  const [year, month] = p.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[parseInt(month) - 1]} '${year.slice(2)}`
}

function pickVal(m: AnyBucket, field: 'firm' | 'planned' | 'production' | 'demand' | 'available', mode: UnitMode): number | null {
  if (field === 'available') return mode === 'h' ? m.available_hours : m.available_litres
  if (field === 'demand') {
    // demand is only available on monthly buckets
    if (!('demand_litres' in m)) return null
    return mode === 'h' ? (m as RCCPMonthlyBucket).demand_hours ?? 0 : (m as RCCPMonthlyBucket).demand_litres
  }
  if (mode === 'h') {
    if (field === 'firm')       return m.firm_hours       ?? 0
    if (field === 'planned')    return m.planned_hours    ?? 0
    if (field === 'production') return m.production_hours ?? 0
  } else {
    if (field === 'firm')       return m.firm_litres
    if (field === 'planned')    return m.planned_litres
    if (field === 'production') return m.production_litres
  }
  return 0
}

interface ChartDataPoint {
  period: string
  label: string
  firm: number          // display: min(firm_raw, within_capacity)
  planned: number       // display: remaining within_capacity after firm
  firm_raw: number      // actual firm demand (tooltip only)
  planned_raw: number   // actual planned demand (tooltip only)
  overload: number      // max(0, total_production - available) — true excess above capacity
  demand: number
  available: number | null
  utilisation: number | null
}

function buildData(
  lines: RCCPLine[],
  selectedLines: string[],
  unitMode: UnitMode,
  visiblePeriods: string[],
  granularity: Granularity,
): ChartDataPoint[] {
  const activeCodes = new Set(selectedLines.length === 0 ? lines.map(l => l.line_code) : selectedLines)
  const activeLines = lines.filter(l => activeCodes.has(l.line_code))

  const periodMap: Record<string, ChartDataPoint> = {}
  for (const line of activeLines) {
    const buckets: AnyBucket[] = granularity === 'weekly' ? line.weekly : line.monthly
    for (const m of buckets) {
      if (!visiblePeriods.includes(m.period)) continue
      if (!periodMap[m.period]) {
        periodMap[m.period] = {
          period: m.period,
          label: shortPeriod(m.period),
          firm: 0, planned: 0, firm_raw: 0, planned_raw: 0, overload: 0,
          demand: 0, available: 0, utilisation: null,
        }
      }
      periodMap[m.period].firm_raw    += pickVal(m, 'firm',    unitMode) ?? 0
      periodMap[m.period].planned_raw += pickVal(m, 'planned', unitMode) ?? 0
      periodMap[m.period].demand  += pickVal(m, 'demand',  unitMode) ?? 0
      const avail = pickVal(m, 'available', unitMode)
      if (avail !== null) {
        periodMap[m.period].available = (periodMap[m.period].available ?? 0) + avail
      }
    }
  }

  for (const pt of Object.values(periodMap)) {
    const production = pt.firm_raw + pt.planned_raw
    const avail = pt.available
    if (avail !== null && avail > 0) {
      pt.utilisation = Math.round((production / avail) * 100)
      pt.overload = Math.max(0, production - avail)
      // Split production at the capacity boundary so bars total to production (not production + overload)
      const withinCapacity = Math.min(production, avail)
      pt.firm    = Math.min(pt.firm_raw, withinCapacity)
      pt.planned = withinCapacity - pt.firm
    } else {
      pt.overload = 0
      pt.firm    = pt.firm_raw
      pt.planned = pt.planned_raw
    }
  }

  return Object.values(periodMap).sort((a, b) => a.period.localeCompare(b.period))
}

const LINE_ORDER = ['A101','A102','A103','A201','A202','A302','A303','A304','A305','A307','A308','A401','A501','A502']

function sortLines(lines: RCCPLine[]): RCCPLine[] {
  return [...lines].sort((a, b) => {
    const ai = LINE_ORDER.indexOf(a.line_code)
    const bi = LINE_ORDER.indexOf(b.line_code)
    if (ai === -1 && bi === -1) return a.line_code.localeCompare(b.line_code)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

const RISK_COLORS: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F97316',
  Watch: '#EAB308',
  Stable: '#22C55E',
  'No data': '#94A3B8',
}

// Orange triangle warning marker rendered above overload bars
function WarningTriangle(props: any) {
  const { x, y, width, value } = props
  if (!value) return null
  const mx = x + width / 2
  return (
    <svg x={mx - 5} y={y - 15} width={10} height={10} viewBox="0 0 10 10" overflow="visible">
      <polygon points="5,0 10,10 0,10" fill="#F97316" />
    </svg>
  )
}

function Dot({ color, fill }: { color: string; fill?: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
      backgroundColor: fill ? color : 'transparent',
      border: `2px solid ${color}`,
    }} />
  )
}

function CustomTooltip({ active, payload, label, unitMode }: any) {
  if (!active || !payload?.length) return null
  const pt      = payload[0]?.payload as ChartDataPoint | undefined
  const firm    = pt?.firm_raw    ?? 0
  const planned = pt?.planned_raw ?? 0
  const avail   = payload.find((p: any) => p.dataKey === 'available')?.value as number | undefined
  const total   = firm + planned
  const gap     = avail != null ? avail - total : null
  const suffix  = unitMode === 'h' ? 'h' : 'L'
  const fmt     = (v: number) => `${fmtVal(Math.abs(v), unitMode)}${suffix}`
  const fmtGap  = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(v)}`

  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 14,
      boxShadow: '0 8px 24px rgba(0,0,0,0.10)', padding: '14px 16px',
      minWidth: 220, fontSize: 12,
    }}>
      {/* Header */}
      <p style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10, fontSize: 13 }}>{label}</p>

      {/* Capacity + production rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {avail != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dot color="#94A3B8" fill={false} />
            <span style={{ color: '#94A3B8', flex: 1 }}>Effective Capacity</span>
            <span style={{ fontWeight: 600, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{fmt(avail)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot color="#4F46E5" fill={true} />
          <span style={{ color: '#4B5563', flex: 1 }}>Firm (YPAC)</span>
          <span style={{ fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(firm)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dot color="#A5B4FC" fill={true} />
          <span style={{ color: '#4B5563', flex: 1 }}>Forecast (LA)</span>
          <span style={{ fontWeight: 600, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(planned)}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #F1F5F9', margin: '10px 0' }} />

      {/* Totals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>Total Required</span>
          <span style={{ fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>{fmt(total)}</span>
        </div>
        {gap != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: '#94A3B8' }}>Gap</span>
            <span style={{
              fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              color: gap >= 0 ? '#10B981' : '#EF4444',
            }}>{fmtGap(gap)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Custom X-axis tick — shows period label + "⚠ N" badge when N lines are at risk
function CustomXTick({ x, y, payload, allLines, visiblePeriods, granularity }: any) {
  const period = visiblePeriods?.find((p: string) => shortPeriod(p) === payload.value)
  const atRisk = period
    ? (allLines as RCCPLine[]).filter(l => {
        const buckets = granularity === 'weekly' ? l.weekly : l.monthly
        const m = buckets.find((m: AnyBucket) => m.period === period)
        return m?.utilisation_pct != null && m.utilisation_pct >= 100
      }).length
    : 0
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#94A3B8" fontSize={10}>
        {payload.value}
      </text>
      {atRisk > 0 && (
        <text x={0} y={14} dy={12} textAnchor="middle" fill="#EF4444" fontSize={9} fontWeight="bold">
          ⚠ {atRisk}
        </text>
      )}
    </g>
  )
}

// Utilisation heat map — line × period matrix below the main chart
function utilCellColor(util: number | null): string {
  if (util === null)  return '#F1F5F9'   // no data
  if (util >= 115)    return '#F87171'   // red-400    — critical (≥115%)
  if (util >= 100)    return '#FCA5A5'   // red-300    — overloaded (100–114%)
  if (util >= 90)     return '#FDE68A'   // amber-200  — near limit (90–99%)
  if (util >= 75)     return '#FEF3C7'   // amber-100  — watch (75–89%)
  if (util >= 50)     return '#D1FAE5'   // emerald-100 — healthy (50–74%)
  return                     '#ECFDF5'   // emerald-50  — idle (<50%)
}

function UtilHeatMap({
  lines, visiblePeriods, selectedLines, onToggleLine, granularity,
}: {
  lines: RCCPLine[]
  visiblePeriods: string[]
  selectedLines: string[]
  onToggleLine: (code: string) => void
  granularity: Granularity
}) {
  if (!lines.length || !visiblePeriods.length) return null
  const anySelected = selectedLines.length > 0
  const sortedLines = sortLines(lines)

  // Per-period overload counts for footer row
  const overloadCounts = visiblePeriods.map(p =>
    sortedLines.filter(l => {
      const buckets = granularity === 'weekly' ? l.weekly : l.monthly
      const m = buckets.find((m: AnyBucket) => m.period === p)
      return m?.utilisation_pct != null && m.utilisation_pct >= 100
    }).length
  )
  const hasAnyOverload = overloadCounts.some(n => n > 0)

  const CELL_H = 28

  return (
    <div className="mt-4 overflow-x-auto">
      {/* Light panel */}
      <div
        className="rounded-xl border border-gray-200 p-3"
        style={{ backgroundColor: '#F8FAFC' }}>

        {/* Month header row */}
        <div className="flex items-center mb-2">
          <div style={{ width: 68, flexShrink: 0 }} />
          {visiblePeriods.map(p => (
            <div key={p} className="flex-1 text-center truncate px-px"
              style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600, letterSpacing: '0.02em' }}>
              {shortPeriod(p)}
            </div>
          ))}
        </div>

        {/* Line rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sortedLines.map(line => {
            const dimmed = anySelected && !selectedLines.includes(line.line_code)
            const isCritical = line.risk_status === 'Critical'
            const isHigh = line.risk_status === 'High'
            const labelColor = isCritical ? '#DC2626' : isHigh ? '#EA580C' : '#4B5563'
            const labelWeight = (isCritical || isHigh) ? 700 : 500
            return (
              <div
                key={line.line_code}
                className="flex items-center"
                style={{
                  opacity: dimmed ? 0.22 : 1,
                  transition: 'opacity 0.15s',
                  gap: 4,
                }}>

                {/* Sticky line label */}
                <div
                  className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0"
                  style={{
                    width: 68, flexShrink: 0,
                    paddingRight: 6,
                    position: 'sticky', left: 0, zIndex: 1,
                    backgroundColor: '#F8FAFC',
                  }}
                  onClick={() => onToggleLine(line.line_code)}
                  title={`${line.line_code} — ${line.risk_status}`}>
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: RISK_COLORS[line.risk_status] ?? '#94A3B8' }}
                  />
                  <span
                    className="text-[9px] truncate"
                    style={{ fontWeight: labelWeight, color: labelColor }}>
                    {line.line_code}
                  </span>
                </div>

                {/* Cells */}
                {visiblePeriods.map(p => {
                  const buckets = granularity === 'weekly' ? line.weekly : line.monthly
                  const bucket = buckets.find(m => m.period === p)
                  const util = bucket?.utilisation_pct ?? null
                  const bg = utilCellColor(util)
                  return (
                    <div
                      key={p}
                      className="flex-1 rounded-md cursor-pointer"
                      style={{
                        height: CELL_H,
                        backgroundColor: bg,
                        minWidth: 0,
                        flexShrink: 1,
                      }}
                      title={util !== null ? `${line.line_code} · ${shortPeriod(p)}: ${util}%` : `${line.line_code} · ${shortPeriod(p)}: no data`}
                      onClick={() => onToggleLine(line.line_code)}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer: overloaded line count per period */}
        {hasAnyOverload && (
          <div className="flex items-center mt-3 pt-2" style={{ borderTop: '1px solid rgba(148,163,184,0.15)', gap: 4 }}>
            <div
              className="flex items-center flex-shrink-0"
              style={{
                width: 68, flexShrink: 0, paddingRight: 6,
                position: 'sticky', left: 0, zIndex: 1,
                backgroundColor: '#F8FAFC',
              }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3 }}>
                Lines<br />≥100%
              </span>
            </div>
            {overloadCounts.map((count, colIdx) => (
              <div
                key={visiblePeriods[colIdx]}
                className="flex-1 flex items-center justify-center rounded-md"
                style={{
                  height: CELL_H,
                  backgroundColor: count === 0 ? '#F8FAFC' : count >= 3 ? '#FCA5A5' : '#FDE68A',
                  minWidth: 0,
                }}>
                {count > 0 && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: count >= 3 ? '#B91C1C' : '#C2410C',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    ⚠{count}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend — stays on light background outside the dark panel */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {[
          { bg: '#ECFDF5', label: '< 50% Idle' },
          { bg: '#D1FAE5', label: '50–74% Healthy' },
          { bg: '#FEF3C7', label: '75–89% Watch' },
          { bg: '#FDE68A', label: '90–99% Near limit' },
          { bg: '#FCA5A5', label: '100–114% Overloaded' },
          { bg: '#F87171', label: '≥ 115% Critical' },
        ].map(({ bg, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="inline-block rounded-sm" style={{ width: 12, height: 12, backgroundColor: bg, border: '1px solid rgba(0,0,0,0.18)' }} />
            <span className="text-[9px] text-gray-400">{label}</span>
          </div>
        ))}
        <span className="text-[9px] text-gray-300 ml-auto">Click row to filter chart</span>
      </div>
    </div>
  )
}

// Custom legend to match Figma
function CustomLegend() {
  const items = [
    { color: '#EF4444', dash: true,  label: 'Effective Capacity (OEE 55%)' },
    { color: '#4F46E5', dash: false, label: 'Firm Orders (YPAC)' },
    { color: '#BAE6FD', dash: false, label: 'Forecast Demand (LA)' },
    { color: '#FCA5A5', dash: false, label: 'Overload' },
    { color: '#F97316', dash: false, label: 'S&OP Demand', dot: true },
  ]
  return (
    <div className="flex items-center gap-4 flex-wrap justify-end">
      {items.map(({ color, dash, label, dot }) => (
        <div key={label} className="flex items-center gap-1.5">
          {dot ? (
            <span className="w-4 h-0.5 inline-block relative" style={{ backgroundColor: color }}>
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            </span>
          ) : dash ? (
            <span className="w-5 border-t-2 border-dashed inline-block" style={{ borderColor: color }} />
          ) : (
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: color }} />
          )}
          <span className="text-[11px] text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  )
}

export default function CapacityChart({ lines, unitMode, granularity, visiblePeriods, selectedLines, onToggleLine, onClearLines }: Props) {
  const [showHeatMap, setShowHeatMap] = useState(true)

  const sortedLines = sortLines(lines)
  const data = buildData(lines, selectedLines, unitMode, visiblePeriods, granularity)

  const chartTitle =
    selectedLines.length === 0 ? 'All Lines' : selectedLines.join(' + ')

  const n = visiblePeriods.length
  const horizonLabel = granularity === 'weekly'
    ? (n <= 4 ? '4-Week View' : n <= 8 ? '8-Week View' : '12-Week View')
    : (n >= 18 ? '18-Month Rolling View' : n >= 12 ? '12-Month Rolling View' : n >= 6 ? '6-Month View' : '3-Month View')

  const firstPeriod = visiblePeriods[0]
  const lastPeriod  = visiblePeriods[visiblePeriods.length - 1]
  const periodRange = firstPeriod && lastPeriod
    ? ` — ${shortPeriod(firstPeriod).replace("'", '20')}–${shortPeriod(lastPeriod).replace("'", '20')}`
    : ''

  const suffix = unitMode === 'h' ? 'h' : 'L'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4"
      style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-1 gap-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900">
            {horizonLabel}{periodRange} — {chartTitle}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {granularity === 'weekly'
              ? 'Weekly buckets · production orders only · gaps reflect within-week peaks, not directly comparable to monthly view'
              : 'Monthly buckets'} · OEE 55% · showing in {unitMode === 'h' ? 'effective hours' : 'litres'}
          </p>
        </div>
        {/* Line selector — multi-toggle */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
          <button
            onClick={() => onClearLines()}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
              selectedLines.length === 0
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
            }`}>
            All
          </button>
          {sortedLines.map((l) => {
            const isActive = selectedLines.includes(l.line_code)
            return (
              <button
                key={l.line_code}
                onClick={() => onToggleLine(l.line_code)}
                className={`px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  isActive
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
                style={isActive ? { backgroundColor: RISK_COLORS[l.risk_status] ?? '#6366F1' } : {}}>
                {l.line_code}
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom legend */}
      <div className="mb-3">
        <CustomLegend />
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 20, right: 8, bottom: selectedLines.length === 0 ? 16 : 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={selectedLines.length === 0
              ? <CustomXTick allLines={lines} visiblePeriods={visiblePeriods} granularity={granularity} />
              : { fontSize: 10, fill: '#94A3B8' }
            }
          />
          <YAxis
            tickFormatter={(v) => fmtVal(v, unitMode)}
            tick={{ fontSize: 10, fill: '#94A3B8' }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            content={(props) => <CustomTooltip {...props} unitMode={unitMode} />}
            cursor={{ fill: 'rgba(99,102,241,0.04)' }}
          />

          {/* Stacked bars: firm + planned + overload */}
          <Bar dataKey="firm"    name="Firm Orders (YPAC)"  stackId="prod" fill="#4F46E5" maxBarSize={48} />
          <Bar dataKey="planned" name="Forecast Demand (LA)" stackId="prod" fill="#BAE6FD" maxBarSize={48} />
          <Bar dataKey="overload" name="Overload" stackId="prod" fill="#FCA5A5" maxBarSize={48} radius={[3,3,0,0]}>
            <LabelList content={WarningTriangle} />
          </Bar>

          {/* S&OP Demand — orange solid line (monthly only; demand data is not available at weekly granularity) */}
          {granularity === 'monthly' && (
            <Line
              dataKey="demand"
              name="S&OP Demand"
              type="monotone"
              stroke="#F97316"
              strokeWidth={2}
              dot={{ r: 3, fill: '#F97316' }}
            />
          )}

          {/* Capacity ceiling — red dashed, stepAfter so it renders flat per month like Figma */}
          <Line
            dataKey="available"
            name={`Effective Capacity (OEE 55%)`}
            type="stepAfter"
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Bottom footnote + heat map toggle */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <span>ⓘ</span>
          <span>
            Effective capacity = working days × OEE 55% × available mins per day.
            Red bars = production requirement exceeds effective capacity.
            Values in {unitMode === 'h' ? `effective hours (${suffix})` : `litres (${suffix})`}.
          </span>
        </p>
        <button
          onClick={() => setShowHeatMap(v => !v)}
          className="text-[10px] text-indigo-400 hover:text-indigo-600 whitespace-nowrap flex-shrink-0 transition-colors">
          {showHeatMap ? 'Hide heat map' : 'Show heat map'}
        </button>
      </div>

      {/* Utilisation heat map — line × period */}
      {showHeatMap && (
        <UtilHeatMap
          lines={sortedLines}
          visiblePeriods={visiblePeriods}
          selectedLines={selectedLines}
          onToggleLine={onToggleLine}
          granularity={granularity}
        />
      )}
    </div>
  )
}
