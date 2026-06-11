import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Bar, Line, ReferenceLine,
} from 'recharts'
import type { RCCPLine, RCCPMonthlyBucket, RCCPPortfolioChange, UnitMode } from '../../types'
import { C, addMonths, shortMonth } from './brand'

// Shared Capacity vs Actuals chart used by the Executive Summary (per plant
// and as the All Plants aggregate). Pure presentation — page builds the line
// list and passes it in.

export type ChartRow = {
  period: string
  label: string
  isActual: boolean
  available: number | null
  demand: number | null
  launches?: RCCPPortfolioChange[]
  [key: string]: unknown
}

export function formatLarge(v: number, unit: 'L' | 'h'): string {
  const u = unit === 'L' ? 'L' : 'h'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${u}`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k${u}`
  return `${Math.round(v)}${u}`
}

export function buildChartData(
  lines: RCCPLine[],
  planCycleDate: string,
  unitMode: UnitMode,
  launchesByPeriod: Record<string, RCCPPortfolioChange[]> = {},
): ChartRow[] {
  const cycle = addMonths(planCycleDate.slice(0, 7), 0)
  const actualPeriods = [-3, -2, -1].map(o => addMonths(cycle, o))
  const forwardPeriods = Array.from({ length: 12 }, (_, i) => addMonths(cycle, i))
  const allPeriods = [...actualPeriods, ...forwardPeriods]

  const pickL = (m: RCCPMonthlyBucket, k: 'firm' | 'planned' | 'production' | 'actual' | 'demand' | 'available') => {
    const isLitres = unitMode === 'L'
    switch (k) {
      case 'firm':       return isLitres ? m.firm_litres : m.firm_hours
      case 'planned':    return isLitres ? m.planned_litres : m.planned_hours
      case 'production': return isLitres ? m.production_litres : m.production_hours
      case 'actual':     return isLitres ? m.actual_litres : m.actual_hours
      case 'demand':     return isLitres ? m.demand_litres : m.demand_hours
      case 'available':  return isLitres ? m.available_litres : m.available_hours
    }
  }

  return allPeriods.map(period => {
    const isActual = actualPeriods.includes(period)
    const row: ChartRow = {
      period,
      label: shortMonth(period),
      isActual,
      available: null,
      demand: null,
    }

    for (const line of lines) {
      const m = line.monthly.find(x => x.period === period)
      if (!m) continue
      if (isActual) {
        const a = pickL(m, 'actual')
        row[`actual_${line.line_code}`] = a ?? pickL(m, 'production') ?? 0
      } else {
        row[`firm_${line.line_code}`] = pickL(m, 'firm') ?? 0
        row[`mrp_${line.line_code}`]  = pickL(m, 'planned') ?? 0
      }
    }

    let demand = 0, avail = 0, anyDem = false, anyAvail = false
    for (const line of lines) {
      const m = line.monthly.find(x => x.period === period)
      if (!m) continue
      const d = pickL(m, 'demand')
      const a = pickL(m, 'available')
      if (d !== null && d !== undefined) { demand += d; anyDem = true }
      if (a !== null && a !== undefined) { avail += a; anyAvail = true }
    }
    row.demand    = isActual ? null : (anyDem ? demand : null)
    row.available = anyAvail ? avail : null
    row.launches  = launchesByPeriod[period]
    return row
  })
}

function LaunchTick(props: { data: ChartRow[] } & Record<string, unknown>) {
  const data = props.data
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const payload = props.payload as { value?: string | number } | undefined
  const index = typeof props.index === 'number' ? props.index : undefined
  const row = index != null ? data[index] : undefined
  const launches = row?.launches ?? []
  const has = launches.length > 0
  const tip = has
    ? `New launch · ${launches.map(l => `${l.item_code ?? '?'}${l.line_code ? ' · ' + l.line_code : ''}`).join('; ')}`
    : ''
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} fontWeight={500} fill={C.ink2}>
        {payload?.value ?? ''}
      </text>
      {has && (
        <g>
          <title>{tip}</title>
          <circle cx={0} cy={22} r={3.5} fill={C.lime} stroke={C.limeDeep} strokeWidth={0.6} />
        </g>
      )}
    </g>
  )
}

function ChartTooltip({
  active, payload, label, unitMode, isActual,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string; dataKey: string }[]
  label?: string
  unitMode: UnitMode
  isActual?: boolean
}) {
  if (!active || !payload?.length) return null

  const rowLabel = (name: string) => {
    if (name === 'available') return 'Capacity'
    if (name === 'demand')    return 'Demand (S&OP)'
    if (name.startsWith('actual_')) return name.replace('actual_', '')
    if (name.startsWith('firm_'))   return `${name.replace('firm_', '')} · Firm`
    if (name.startsWith('mrp_'))    return `${name.replace('mrp_', '')} · MRP`
    return name
  }

  const visible = payload.filter(p => p.value > 0 || p.dataKey === 'available' || p.dataKey === 'demand')

  return (
    <div
      className="bg-white px-3.5 py-2.5 text-[12px] min-w-[180px]"
      style={{
        border: `1px solid ${C.border2}`,
        borderRadius: 10,
        boxShadow: '0 4px 12px rgba(12,60,93,0.08)',
      }}
    >
      <p className="font-semibold mb-1.5 pb-1.5 flex items-center justify-between" style={{ color: C.navy, borderBottom: `1px solid ${C.border}` }}>
        <span>{label}</span>
        <span className="font-mono text-[10.5px] font-medium" style={{ color: C.ink3 }}>
          {isActual ? 'ACTUAL' : 'PLAN'}
        </span>
      </p>
      <div className="space-y-1">
        {visible.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block flex-shrink-0"
                style={{
                  width: 9, height: 9, borderRadius: 2,
                  background: p.color, border: p.dataKey.startsWith('mrp_') ? `1px solid ${C.limeDeep}` : 'none',
                }}
              />
              <span style={{ color: C.ink2 }}>{rowLabel(p.dataKey)}</span>
            </span>
            <span className="font-mono font-semibold tabnum" style={{ color: C.ink }}>
              {formatLarge(p.value ?? 0, unitMode)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  title: string                  // e.g. "Plant 1 · Capacity vs Actuals" or "All plants"
  lines: RCCPLine[]
  planCycleDate: string
  unitMode: UnitMode
  launchesByPeriod?: Record<string, RCCPPortfolioChange[]>
  subtitle?: string              // override the default list-of-line-codes
  headerMetricLabel?: string     // default "15-month capacity"
}

export default function PlantChart({
  title, lines, planCycleDate, unitMode, launchesByPeriod, subtitle, headerMetricLabel,
}: Props) {
  const data = buildChartData(lines, planCycleDate, unitMode, launchesByPeriod ?? {})
  const hasLaunches = data.some(d => (d.launches?.length ?? 0) > 0)
  const dividerIdx = data.findIndex(d => !d.isActual)
  const dividerLabel = dividerIdx > 0 ? data[dividerIdx]?.label : null

  const totalAvail = data.reduce((s, d) => s + (d.available ?? 0), 0)
  const lineCodes = lines.map(l => l.line_code)
  const subtitleText = subtitle ?? lineCodes.join(' · ')

  return (
    <div
      className="bg-white rounded-2xl p-5 sm:p-6"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            {title}
          </h2>
          <p className="text-[12px] mt-1" style={{ color: C.ink3, marginLeft: 13 }}>
            {subtitleText}
          </p>
        </div>
        <div className="text-right font-mono text-[11.5px]" style={{ color: C.ink3 }}>
          {headerMetricLabel ?? '15-month capacity'}
          <strong className="block mt-0.5 text-[15px] font-semibold tabnum" style={{ color: C.navy, letterSpacing: '-0.02em' }}>
            {totalAvail > 0 ? formatLarge(totalAvail, unitMode) : '—'}
          </strong>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 pb-3 mb-2 text-[11.5px] font-medium" style={{ color: C.ink3, borderBottom: `1px solid ${C.border}` }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: 11, height: 11, background: C.ink4 }} />
          Actuals (MB51)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: 11, height: 11, background: C.navy }} />
          Firm orders (YPAC)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: 11, height: 11, background: C.lime, border: `1px solid ${C.limeDeep}` }} />
          MRP proposals (LA)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block" style={{ width: 18, borderTop: `2px dashed ${C.ink2}` }} />
          Capacity ceiling
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block" style={{ width: 18, borderTop: `2px solid ${C.amber}` }} />
          S&amp;OP demand
        </span>
        {hasLaunches && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: C.lime, border: `1px solid ${C.limeDeep}` }} />
            New launch
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={272}>
        <ComposedChart data={data} margin={{ top: 18, right: 28, bottom: hasLaunches ? 18 : 6, left: -8 }} barCategoryGap="12%" barGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={(props) => <LaunchTick {...props} data={data} />}
            axisLine={{ stroke: C.border2 }}
            tickLine={false}
            height={hasLaunches ? 38 : 24}
          />
          <YAxis
            tickFormatter={(v) => formatLarge(v as number, unitMode)}
            tick={{ fontSize: 10, fill: C.ink3, fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: 'rgba(12,60,93,0.04)' }}
            content={(props) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as unknown as { name: string; value: number; color: string; dataKey: string }[]}
                label={props.label as string}
                unitMode={unitMode}
                isActual={data.find(d => d.label === props.label)?.isActual}
              />
            )}
          />

          {dividerLabel && (
            <ReferenceLine
              x={dividerLabel}
              stroke={C.navy}
              strokeWidth={1}
              strokeDasharray="3 3"
              label={{ value: 'Today', position: 'top', fontSize: 9, fill: C.navy, fontWeight: 700, dy: -4 }}
            />
          )}

          {lineCodes.map((lc, i) => (
            <Bar
              key={`actual_${lc}`}
              dataKey={`actual_${lc}`}
              stackId="stack"
              name={`actual_${lc}`}
              fill={C.ink4}
              radius={i === lineCodes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          ))}

          {lineCodes.map((lc) => (
            <Bar
              key={`firm_${lc}`}
              dataKey={`firm_${lc}`}
              stackId="stack"
              name={`firm_${lc}`}
              fill={C.navy}
              radius={[0, 0, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          ))}

          {lineCodes.map((lc, i) => (
            <Bar
              key={`mrp_${lc}`}
              dataKey={`mrp_${lc}`}
              stackId="stack"
              name={`mrp_${lc}`}
              fill={C.lime}
              stroke={C.limeDeep}
              strokeWidth={0.6}
              radius={i === lineCodes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          ))}

          <Line
            type="monotone"
            dataKey="available"
            name="available"
            stroke={C.ink2}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />

          <Line
            type="monotone"
            dataKey="demand"
            name="demand"
            stroke={C.amber}
            strokeWidth={2.2}
            dot={{ r: 3, fill: C.amber, stroke: '#fff', strokeWidth: 1.2 }}
            activeDot={{ r: 4, fill: C.amber, stroke: '#fff', strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
