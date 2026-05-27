import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  Printer, RefreshCw, AlertCircle, Calendar, Pencil, TrendingUp, AlertTriangle, Activity, Users, Wand2, FileSpreadsheet,
} from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard, downloadVerificationExcel } from '../api/rccp'
import type { Batch, RCCPLine, RCCPMonthlyBucket, UnitMode } from '../types'
import NextMonthSpotlight from '../components/rccp/NextMonthSpotlight'
import LineRiskRadar from '../components/rccp/LineRiskRadar'
import { HIDDEN_LINE_CODES } from '../components/rccp/brand'

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const C = {
  navy: '#0C3C5D', navy2: '#143F5C', navyDeep: '#082A40',
  navyTint: '#E8EEF3', navyTint2: '#D6E0E9',
  lime: '#AACD00', limeDeep: '#7B9400', limeTint: '#F0F7CC', limeBright: '#BFDD20',
  sage: '#B1CCBB', sageTint: '#EDF4EF',
  ink: '#0F1A24', ink2: '#3F4D5B', ink3: '#6B7A8A', ink4: '#9CABB9',
  border: '#E2E6EA', border2: '#CCD3DA', bg: '#F7F7F5',
  red: '#C2410C', redLight: '#FEE4D5',
  amber: '#B45309', amberLight: '#FEF3C7',
  green: '#166534', greenLight: '#DCFCE7',
}

const PLANT_ORDER = ['Plant 1', 'Plant 2', 'Plant 3', 'Plant 4', 'Plant 5']
const LINE_ORDER = ['A101','A102','A103','A201','A202','A302','A303','A304','A305','A307','A308','A401','A501','A502']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function addMonths(yyyyMM: string, n: number): string {
  let [y, m] = yyyyMM.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1)  { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

function shortMonth(period: string): string {
  const [, m] = period.split('-')
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]
}

function formatLarge(v: number, unit: 'L' | 'h'): string {
  const u = unit === 'L' ? 'L' : 'h'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${u}`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k${u}`
  return `${Math.round(v)}${u}`
}

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

function monthLabel(period: string): string {
  // "2026-07" → "July 2026"
  const [y, m] = period.split('-').map(Number)
  return `${['January','February','March','April','May','June','July','August','September','October','November','December'][m-1]} ${y}`
}

// ─── Auto-commentary generator ────────────────────────────────────────────────
function generateCommentary(
  lines: import('../types').RCCPLine[],
  horizonPeriods: string[],
  unitMode: UnitMode,
): string {
  if (!lines.length || !horizonPeriods.length) return ''
  const periodSet = new Set(horizonPeriods)
  const horizonMonths = horizonPeriods.length

  // ── Forward-horizon aggregates ──
  let totAvail = 0, totProd = 0, totDemand = 0, totFirm = 0, totMRP = 0
  for (const l of lines) for (const m of l.monthly) {
    if (!periodSet.has(m.period)) continue
    totAvail  += m.available_litres ?? 0
    totProd   += m.production_litres ?? 0
    totDemand += m.demand_litres ?? 0
    totFirm   += m.firm_litres ?? 0
    totMRP    += m.planned_litres ?? 0
  }
  const overallUtil = totAvail > 0 ? Math.round((totProd / totAvail) * 100) : null
  const demandCov   = totAvail > 0 ? Math.round((totDemand / totAvail) * 100) : null
  const firmShare   = totProd > 0 ? Math.round((totFirm / totProd) * 100) : null

  // ── Past actuals recap ──
  let totalActual = 0, totalActualPlan = 0, actualMonthCount = 0
  const pastPeriodsSeen = new Set<string>()
  for (const l of lines) for (const m of l.monthly) {
    if (periodSet.has(m.period)) continue
    if (m.actual_litres === null || m.actual_litres === undefined) continue
    totalActual += m.actual_litres
    totalActualPlan += m.production_litres ?? 0
    pastPeriodsSeen.add(m.period)
  }
  actualMonthCount = pastPeriodsSeen.size
  const actualVar = totalActualPlan > 0
    ? Math.round(((totalActual - totalActualPlan) / totalActualPlan) * 100)
    : null

  // ── Per-period peak (demand vs capacity) ──
  const periodTotals: Record<string, { avail: number; demand: number }> = {}
  for (const l of lines) for (const m of l.monthly) {
    if (!periodSet.has(m.period)) continue
    if (!periodTotals[m.period]) periodTotals[m.period] = { avail: 0, demand: 0 }
    periodTotals[m.period].avail  += m.available_litres ?? 0
    periodTotals[m.period].demand += m.demand_litres ?? 0
  }
  let peakPeriod: string | null = null
  let peakRatio = 0
  for (const [p, t] of Object.entries(periodTotals)) {
    if (t.avail <= 0) continue
    const r = t.demand / t.avail
    if (r > peakRatio) { peakRatio = r; peakPeriod = p }
  }
  const peakPct = Math.round(peakRatio * 100)

  // ── Capacity vs headcount — computed separately so the narrative names the cause ──
  const overCap: { code: string; util: number; period: string }[] = []
  const nearCap: string[] = []
  const shortStaffed: string[] = []
  for (const l of lines) {
    let peak: number | null = null, peakP: string | null = null, short = false
    for (const m of l.monthly) {
      if (!periodSet.has(m.period)) continue
      if (m.utilisation_pct != null && (peak === null || m.utilisation_pct > peak)) { peak = m.utilisation_pct; peakP = m.period }
      if ((m.hc_shortfall ?? 0) >= 1) short = true
    }
    if (peak != null && peak >= 100 && peakP) overCap.push({ code: l.line_code, util: peak, period: peakP })
    else if (peak != null && peak >= 90) nearCap.push(l.line_code)
    if (short) shortStaffed.push(l.line_code)
  }
  overCap.sort((a, b) => b.util - a.util)

  // ── Build narrative ──
  const u = unitMode === 'L' ? 'L' : 'h'
  const fmt = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${u}`
    if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k${u}`
    return `${Math.round(v)}${u}`
  }
  const list = (codes: string[], max = 5) => {
    const shown = codes.slice(0, max).join(', ')
    return codes.length > max ? `${shown} (+${codes.length - max} more)` : shown
  }

  const sentences: string[] = []

  // Past recap
  if (actualMonthCount > 0 && totalActualPlan > 0 && actualVar !== null) {
    const direction = actualVar >= 0 ? 'above' : 'below'
    sentences.push(
      `Past ${actualMonthCount} month${actualMonthCount > 1 ? 's' : ''} delivered ${fmt(totalActual)} actual production vs ${fmt(totalActualPlan)} planned (${actualVar >= 0 ? '+' : ''}${actualVar}% ${direction} plan).`
    )
  } else if (actualMonthCount === 0) {
    sentences.push(`No actual production data uploaded yet — past performance not visualised.`)
  }

  // Forward overview
  if (overallUtil !== null && demandCov !== null) {
    const firmFragment = firmShare !== null
      ? ` of which ${firmShare}% is firm (YPAC) and ${100 - firmShare}% MRP proposals (LA)`
      : ''
    sentences.push(
      `Over the ${horizonMonths}-month horizon, site utilisation runs at ${overallUtil}% with demand at ${demandCov}% of capacity${firmFragment}.`
    )
  }

  // Capacity (physical throughput) — stated as its own axis
  if (overCap.length > 0) {
    const named = overCap.slice(0, 4).map(o => `${o.code} (${o.util}% in ${monthLabel(o.period)})`).join(', ')
    const more = overCap.length > 4 ? ` (+${overCap.length - 4} more)` : ''
    sentences.push(`Capacity: ${overCap.length} line${overCap.length > 1 ? 's' : ''} exceed available capacity — ${named}${more}. Approve overtime or reprofile MRP volume into lighter months.`)
  } else if (nearCap.length > 0) {
    sentences.push(`Capacity: no line is over the ceiling; headroom is tightest on ${list(nearCap)} (site peak ${peakPct}%${peakPeriod ? ` in ${monthLabel(peakPeriod)}` : ''}).`)
  } else {
    sentences.push(`Capacity: comfortable on every line — no capacity constraint over the horizon (site peak ${peakPct}%${peakPeriod ? ` in ${monthLabel(peakPeriod)}` : ''}).`)
  }

  // Headcount (people) — explicitly separated from capacity
  if (shortStaffed.length > 0) {
    sentences.push(`Headcount: ${shortStaffed.length} line${shortStaffed.length > 1 ? 's' : ''} short-staffed by ≥1 operator — ${list(shortStaffed)}. This is a labour gap, not a capacity problem; review the headcount plan.`)
  } else {
    sentences.push(`Headcount: all lines adequately staffed across the horizon.`)
  }

  return sentences.join(' ')
}

// ─── Risk colours ─────────────────────────────────────────────────────────────
const RISK: Record<string, { bg: string; text: string; dot: string }> = {
  Critical:  { bg: C.redLight,   text: C.red,        dot: C.red },
  High:      { bg: C.amberLight, text: C.amber,      dot: C.amber },
  Watch:     { bg: '#FEF9C3',    text: '#A16207',    dot: '#FACC15' },
  Stable:    { bg: C.limeTint,   text: C.limeDeep,   dot: C.lime },
  'No data': { bg: '#F4F4F5',    text: C.ink3,       dot: C.ink4 },
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function KPITile({
  label, value, suffix = '', delta, deltaLabel, footnote, tone, icon: Icon,
}: {
  label: string
  value: string | number
  suffix?: string
  delta?: 'up' | 'down' | null
  deltaLabel?: string
  footnote?: string
  tone: 'navy' | 'warn' | 'lime'
  icon: React.ElementType
}) {
  const ruleColor = tone === 'warn' ? C.red : tone === 'lime' ? C.lime : C.navy
  const numColor  = tone === 'warn' ? C.red : tone === 'lime' ? C.limeDeep : C.navy
  const icoBg    = tone === 'warn' ? C.redLight : tone === 'lime' ? C.limeTint : C.navyTint
  const icoColor = tone === 'warn' ? C.red : tone === 'lime' ? C.limeDeep : C.navy

  const deltaClass = delta === 'up'
    ? { background: C.redLight, color: C.red }
    : delta === 'down'
    ? { background: C.greenLight, color: C.green }
    : null

  return (
    <div
      className="relative overflow-hidden rounded-xl px-5 py-4 transition-all hover:-translate-y-px"
      style={{
        background: 'linear-gradient(180deg,#FFFFFF 0%,#FAFAFA 100%)',
        border: `1px solid ${C.border}`,
      }}
    >
      <span className="absolute left-0 top-0 w-full" style={{ height: 3, background: ruleColor, opacity: 0.85 }} />
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(120% 80% at 0% 0%,rgba(12,60,93,0.025),transparent 60%)',
        }}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span className="text-[11.5px] font-medium" style={{ color: C.ink3 }}>{label}</span>
        <span
          className="inline-flex items-center justify-center rounded-md"
          style={{ width: 22, height: 22, background: icoBg, color: icoColor }}
        >
          <Icon className="w-3 h-3" strokeWidth={2.4} />
        </span>
      </div>
      <div className="relative flex items-baseline gap-2">
        <span className="text-[32px] font-semibold leading-none tabnum" style={{ color: numColor, letterSpacing: '-0.025em' }}>
          {value}{suffix && <span className="text-[18px] font-medium ml-px" style={{ color: C.ink3 }}>{suffix}</span>}
        </span>
        {delta && deltaLabel && (
          <span className="font-mono text-[11px] font-medium px-1.5 py-px rounded" style={deltaClass!}>
            {delta === 'up' ? '↑' : '↓'} {deltaLabel}
          </span>
        )}
      </div>
      {footnote && <p className="relative text-[11.5px] mt-3" style={{ color: C.ink3 }}>{footnote}</p>}
    </div>
  )
}

// ─── Plant chart ──────────────────────────────────────────────────────────────
type ChartRow = {
  period: string
  label: string
  isActual: boolean
  available: number | null
  demand: number | null
  [key: string]: unknown
}

function buildChartData(
  lines: RCCPLine[],
  planCycleDate: string,
  unitMode: UnitMode,
): ChartRow[] {
  const cycle = addMonths(planCycleDate.slice(0, 7), 0)
  const actualPeriods = [-3, -2, -1].map(o => addMonths(cycle, o))
  const forwardPeriods = Array.from({ length: 12 }, (_, i) => addMonths(cycle, i))
  const allPeriods = [...actualPeriods, ...forwardPeriods]

  const pickL = (m: RCCPMonthlyBucket, k: 'firm' | 'planned' | 'production' | 'actual' | 'demand' | 'available') => {
    const isLitres = unitMode === 'L'
    switch (k) {
      case 'firm':      return isLitres ? m.firm_litres : m.firm_hours
      case 'planned':   return isLitres ? m.planned_litres : m.planned_hours
      case 'production':return isLitres ? m.production_litres : m.production_hours
      case 'actual':    return isLitres ? m.actual_litres : m.actual_hours
      case 'demand':    return isLitres ? m.demand_litres : m.demand_hours
      case 'available': return isLitres ? m.available_litres : m.available_hours
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
    row.demand    = anyDem   ? demand : null
    row.available = anyAvail ? avail  : null
    return row
  })
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

function PlantChart({
  plantCode, lines, planCycleDate, unitMode,
}: {
  plantCode: string
  lines: RCCPLine[]
  planCycleDate: string
  unitMode: UnitMode
}) {
  const data = buildChartData(lines, planCycleDate, unitMode)
  const dividerIdx = data.findIndex(d => !d.isActual)
  const dividerLabel = dividerIdx > 0 ? data[dividerIdx]?.label : null

  // Total capacity over horizon (for header right-side metric)
  const totalAvail = data.reduce((s, d) => s + (d.available ?? 0), 0)

  const lineCodes = lines.map(l => l.line_code)

  return (
    <div
      className="bg-white rounded-2xl p-5 sm:p-6"
      style={{ border: `1px solid ${C.border}` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            {plantCode} · Capacity vs Actuals
          </h2>
          <p className="text-[12px] mt-1" style={{ color: C.ink3, marginLeft: 13 }}>
            {lineCodes.join(' · ')}
          </p>
        </div>
        <div className="text-right font-mono text-[11.5px]" style={{ color: C.ink3 }}>
          15-month capacity
          <strong className="block mt-0.5 text-[15px] font-semibold tabnum" style={{ color: C.navy, letterSpacing: '-0.02em' }}>
            {totalAvail > 0 ? formatLarge(totalAvail, unitMode) : '—'}
          </strong>
        </div>
      </div>

      {/* Legend */}
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
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 18, right: 28, bottom: 6, left: -8 }} barCategoryGap="12%" barGap={1}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F5" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.ink2, fontWeight: 500 }}
            axisLine={{ stroke: C.border2 }}
            tickLine={false}
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

          {/* Today divider */}
          {dividerLabel && (
            <ReferenceLine
              x={dividerLabel}
              stroke={C.navy}
              strokeWidth={1}
              strokeDasharray="3 3"
              label={{ value: 'Today', position: 'top', fontSize: 9, fill: C.navy, fontWeight: 700, dy: -4 }}
            />
          )}

          {/* Actuals — single neutral grey stacked per line */}
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

          {/* Firm bars (Moove navy) */}
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

          {/* MRP bars (Moove lime) */}
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

          {/* Capacity ceiling — dashed slate */}
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

          {/* Demand — solid amber */}
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

// ─── Plant summary card (compact) — used for the row of plant utilisation ────
function PlantUtilisationStrip({
  plant, lines, periods,
}: { plant: string; lines: RCCPLine[]; periods: Set<string> }) {
  let avail = 0, prod = 0, demand = 0
  for (const l of lines) {
    for (const m of l.monthly) {
      if (!periods.has(m.period)) continue
      avail  += m.available_litres ?? 0
      prod   += m.production_litres ?? 0
      demand += m.demand_litres ?? 0
    }
  }
  const util       = avail > 0 ? Math.round((prod / avail) * 100) : null
  const demandCov  = avail > 0 ? Math.round((demand / avail) * 100) : null
  const worstRisk  = (['Critical','High','Watch','Stable','No data'] as const).find(r =>
    lines.some(l => l.risk_status === r)
  ) ?? 'No data'

  // Why is the plant flagged? Split the drivers so the badge explains itself.
  const overCount = lines.filter(l =>
    l.monthly.some(m => periods.has(m.period) && (m.utilisation_pct ?? 0) >= 100)
  ).length
  const shortCount = lines.filter(l =>
    l.monthly.some(m => periods.has(m.period) && (m.hc_shortfall ?? 0) >= 1)
  ).length

  const utilBarColor = !util ? C.border2
    : util >= 100 ? C.red
    : util >= 90  ? C.amber
    : util >= 75  ? '#FCD34D'
    : C.lime

  const risk = RISK[worstRisk]

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: '#FFFFFF', border: `1px solid ${C.border}` }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <span className="text-[13px] font-semibold" style={{ color: C.navy, letterSpacing: '-0.015em' }}>{plant}</span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: risk.bg, color: risk.text }}
          >
            <span className="rounded-full" style={{ width: 5, height: 5, background: risk.dot, display: 'inline-block' }} />
            {worstRisk}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: C.ink3 }}>
          <span>{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
          <span className="font-mono font-semibold tabnum" style={{ color: utilBarColor }}>{util !== null ? `${util}%` : '—'}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0F2F5' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(util ?? 0, 100)}%`, background: utilBarColor }} />
        </div>
        <div className="text-[10.5px] mt-1.5 font-mono tabnum" style={{ color: C.ink3 }}>
          dem/cap <span style={{ color: demandCov && demandCov > 100 ? C.red : C.ink2 }}>{demandCov !== null ? `${demandCov}%` : '—'}</span>
        </div>
        {(overCount > 0 || shortCount > 0) && (
          <div className="text-[10.5px] mt-1 flex items-center gap-1.5 flex-wrap">
            {overCount > 0 && <span style={{ color: C.red }}>{overCount} over capacity</span>}
            {overCount > 0 && shortCount > 0 && <span style={{ color: C.ink4 }}>·</span>}
            {shortCount > 0 && <span style={{ color: C.amber }}>{shortCount} short-staffed</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Batch selector ───────────────────────────────────────────────────────────
function PublishedBatchSelector({ batches, selectedId, onSelect }: {
  batches: Batch[]; selectedId: number | null; onSelect: (id: number) => void
}) {
  const published = batches.filter(b => b.status === 'PUBLISHED')
  if (published.length <= 1) return null
  return (
    <select
      value={selectedId ?? ''}
      onChange={e => onSelect(Number(e.target.value))}
      className="text-[12.5px] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2"
      style={{ border: `1px solid ${C.border}`, color: C.ink, fontWeight: 500 }}
    >
      {published.map(b => (
        <option key={b.batch_id} value={b.batch_id}>
          {b.batch_name} — {new Date(b.plan_cycle_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
        </option>
      ))}
    </select>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// Fixed 12-month rolling horizon — execs get one consistent picture plus the
// planning-month spotlight; no 3M/6M toggle.
const HORIZON_MONTHS = 12

export default function ExecutiveSummaryPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [unitMode, setUnitMode] = useState<UnitMode>('L')
  const [downloadingXlsx, setDownloadingXlsx] = useState(false)
  const [selectedPlant, setSelectedPlant] = useState<string | null>(null)
  const [selectedLine, setSelectedLine] = useState<string | null>(null)
  const [commentary, setCommentary] = useState('')
  const [editingCommentary, setEditingCommentary] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: listBatches })

  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      const pub = batches.find(b => b.status === 'PUBLISHED')
      if (pub) setSelectedBatchId(pub.batch_id)
    }
  }, [batches, selectedBatchId])

  // Load commentary from localStorage per batch.
  // Key is versioned (v2) so older auto-generated snapshots — which used the
  // pre-fix risk wording — are ignored and the card falls back to live auto-text.
  useEffect(() => {
    if (selectedBatchId === null) return
    const saved = localStorage.getItem(`rccp_commentary_v2_${selectedBatchId}`)
    setCommentary(saved ?? '')
  }, [selectedBatchId])

  function saveCommentary(value: string) {
    setCommentary(value)
    if (selectedBatchId !== null) {
      localStorage.setItem(`rccp_commentary_v2_${selectedBatchId}`, value)
    }
  }

  const { data: dashboard, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ['rccp-dashboard', selectedBatchId],
    queryFn: () => getDashboard(selectedBatchId!),
    enabled: selectedBatchId !== null,
    staleTime: 5 * 60 * 1000,
  })

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some(b => b.status === 'PUBLISHED')

  const allLines = (dashboard?.lines ?? []).filter(l => !HIDDEN_LINE_CODES.includes(l.line_code))
  const plantGroups: Record<string, RCCPLine[]> = {}
  for (const line of allLines) {
    if (!plantGroups[line.plant_code]) plantGroups[line.plant_code] = []
    plantGroups[line.plant_code].push(line)
  }
  const activePlants = PLANT_ORDER.filter(p => plantGroups[p]?.length)

  const linesInScope = sortLines(selectedPlant ? (plantGroups[selectedPlant] ?? []) : allLines)

  const chartsToRender: { plant: string; lines: RCCPLine[] }[] = (() => {
    if (selectedLine) {
      const line = allLines.find(l => l.line_code === selectedLine)
      if (line) return [{ plant: line.plant_code, lines: [line] }]
    }
    if (selectedPlant) return [{ plant: selectedPlant, lines: sortLines(plantGroups[selectedPlant] ?? []) }]
    return activePlants.map(p => ({ plant: p, lines: sortLines(plantGroups[p]) }))
  })()

  function selectPlant(plant: string | null) { setSelectedPlant(plant); setSelectedLine(null) }
  function selectLine(code: string | null) {
    setSelectedLine(code)
    if (code) {
      const plant = allLines.find(l => l.line_code === code)?.plant_code ?? null
      setSelectedPlant(plant)
    }
  }

  // Forward-only periods over the fixed 12-month horizon for KPI / table calculations
  const n = HORIZON_MONTHS
  const cyclePeriod = dashboard ? dashboard.plan_cycle_date.slice(0, 7) : ''
  const horizonPeriods = dashboard
    ? Array.from({ length: n }, (_, i) => addMonths(cyclePeriod, i))
    : []
  const periodSet = new Set(horizonPeriods)

  const cycleLabel = dashboard
    ? new Date(dashboard.plan_cycle_date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : ''
  const cycleShort = dashboard
    ? new Date(dashboard.plan_cycle_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : ''

  // KPI aggregates
  const criticalLines = allLines.filter(l => l.risk_status === 'Critical').length
  const highLines     = allLines.filter(l => l.risk_status === 'High').length
  const linesAtRisk   = criticalLines + highLines
  const labourShorts  = allLines.filter(l => l.material_labour_shortfall).length

  let totAvail = 0, totProd = 0, totDemand = 0
  for (const line of allLines) {
    for (const m of line.monthly) {
      if (!periodSet.has(m.period)) continue
      totAvail  += m.available_litres ?? 0
      totProd   += m.production_litres ?? 0
      totDemand += m.demand_litres ?? 0
    }
  }
  const overallUtil    = totAvail > 0 ? Math.round((totProd / totAvail) * 100) : null
  const demandCoverage = totAvail > 0 ? Math.round((totDemand / totAvail) * 100) : null

  const hasActuals = allLines.some(l => l.monthly.some(m => m.actual_litres !== null))

  // Auto-generated commentary — recomputes when horizon, unit, or data changes
  const autoCommentary = useMemo(
    () => generateCommentary(allLines, horizonPeriods, unitMode),
    [allLines, horizonPeriods, unitMode],
  )

  // What we display in the card: user's saved version takes precedence
  const displayCommentary = commentary.trim() || autoCommentary
  const isUsingAuto = !commentary.trim()

  function startEditing() {
    // Pre-fill the textarea with whatever is currently shown so the user can refine it
    if (!commentary.trim() && autoCommentary) saveCommentary(autoCommentary)
    setEditingCommentary(true)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }
  function regenerateFromData() {
    // Revert to the live auto-text (don't persist a snapshot that can go stale).
    saveCommentary('')
    setEditingCommentary(false)
  }
  function resetToAuto() {
    saveCommentary('')
    setEditingCommentary(false)
  }

  async function handleDownloadXlsx() {
    if (selectedBatchId === null) return
    setDownloadingXlsx(true)
    try {
      await downloadVerificationExcel(selectedBatchId)
    } catch (e) {
      console.error('Verification download failed', e)
      alert('Could not generate the verification Excel. Make sure a batch is published and you are connected.')
    } finally {
      setDownloadingXlsx(false)
    }
  }

  return (
    <div className="px-7 py-6 pb-16 print:px-0 print:py-0 print:pb-0" style={{ color: C.ink }}>

      {/* Print-only branded header (hidden on screen, shown on PDF) */}
      <div
        className="hidden print:flex items-center justify-between mb-3 pb-2"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-3">
          <img src="/moove-logo.png" alt="moove" style={{ height: 22, width: 'auto' }} />
          <span
            className="font-mono font-semibold uppercase"
            style={{
              fontSize: 9,
              color: C.limeDeep,
              letterSpacing: '0.16em',
              background: C.limeTint,
              padding: '2px 6px',
              borderRadius: 3,
              border: `1px solid ${C.lime}`,
            }}
          >
            RCCP
          </span>
          <span className="text-[12px] font-semibold" style={{ color: C.navy }}>
            Capacity Executive Summary
          </span>
        </div>
        <span className="font-mono text-[10px]" style={{ color: C.ink3 }}>
          {cycleLabel} · Gravesend UKP1 · Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1
              className="font-semibold flex items-center gap-3"
              style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}
            >
              <span
                className="inline-block rounded"
                style={{
                  width: 5, height: 30,
                  background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`,
                  boxShadow: '0 0 10px rgba(170,205,0,0.4)',
                }}
              />
              Capacity Executive Summary
            </h1>
            <p className="mt-2 text-[13.5px] max-w-[640px] leading-relaxed" style={{ color: C.ink2 }}>
              <strong style={{ color: C.navy, fontWeight: 600 }}>Gravesend UKP1</strong>{allLines.length > 0 ? ` · ${allLines.length} filling lines` : ''} · OEE baseline 55%.
              {dashboard && (<> Plan cycle <span className="font-mono font-semibold text-[12.5px]" style={{ color: C.navy }}>{cycleShort}</span>.</>)}
              {linesAtRisk > 0 && (
                <> <strong style={{ color: C.navy, fontWeight: 600 }}>{linesAtRisk} line{linesAtRisk > 1 ? 's' : ''} flagged at risk</strong>.</>
              )}
              {!hasActuals && dashboard && (
                <span className="ml-1" style={{ color: C.amber }}> Upload actual_production (MB51) to see real past data.</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end print:hidden">
            {/* Fixed 12-month horizon badge */}
            <span
              className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-medium"
              style={{ border: `1px solid ${C.border}`, background: '#fff', color: C.ink2 }}
            >
              12-month view
            </span>

            {/* Unit toggle */}
            <div className="inline-flex bg-white rounded-lg p-0.5" style={{ border: `1px solid ${C.border}` }}>
              {(['L', 'h'] as UnitMode[]).map(u => (
                <button
                  key={u}
                  onClick={() => setUnitMode(u)}
                  className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
                  style={
                    unitMode === u
                      ? { background: C.navy, color: '#fff' }
                      : { background: 'transparent', color: C.ink3 }
                  }
                >
                  {u === 'L' ? 'Litres' : 'Hours'}
                </button>
              ))}
            </div>

            {/* Cycle badge */}
            {dashboard && (
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-lg text-[12px]"
                style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{ width: 7, height: 7, background: C.lime, boxShadow: '0 0 0 3px rgba(170,205,0,0.18)' }}
                />
                <Calendar className="w-3 h-3" style={{ color: C.ink3 }} />
                <span className="font-mono font-semibold" style={{ color: C.navy }}>{cycleShort}</span>
              </div>
            )}

            <PublishedBatchSelector batches={batches} selectedId={selectedBatchId} onSelect={setSelectedBatchId} />

            {selectedBatchId !== null && (
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
                style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
              >
                <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Refreshing…' : 'Refresh'}
              </button>
            )}

            {selectedBatchId !== null && (
              <button
                onClick={handleDownloadXlsx}
                disabled={downloadingXlsx}
                title="Download the S&OP verification workbook (Capacity vs Volumes)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-[12.5px] font-medium transition-colors disabled:opacity-50"
                style={{ border: `1px solid ${C.border}`, color: C.ink2 }}
              >
                <FileSpreadsheet className={`w-3 h-3 ${downloadingXlsx ? 'animate-pulse' : ''}`} style={{ color: C.limeDeep }} />
                {downloadingXlsx ? 'Preparing…' : 'Verification Excel'}
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium text-white transition-colors"
              style={{ background: C.navy }}
            >
              <Printer className="w-3 h-3" />
              Export PDF
            </button>
          </div>
        </div>
      </motion.div>

      {/* No published batch */}
      {hasNoPublished && (
        <div
          className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3"
          style={{ background: C.amberLight, border: `1px solid #FCD34D` }}
        >
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.amber }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: C.amber }}>No published batch</p>
            <p className="text-[12px] mt-0.5" style={{ color: '#92400E' }}>
              Publish a batch on the Planning Data page to view the executive summary.
            </p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} />
            Loading capacity data…
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: `1px solid #FCA5A5` }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>
            {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(error)}
          </p>
        </div>
      )}

      {dashboard && !isLoading && (
        <>
          {/* 12-month outlook — KPI tiles, grouped under a labelled rail like the spotlight */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="relative pl-4 mt-6 print:mt-2 print-avoid-break"
          >
            <span className="absolute left-0 top-0 bottom-0 rounded" style={{ width: 4, background: `linear-gradient(180deg, ${C.navy}, ${C.navy2})` }} />
            <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.navy }}>
                <span className="rounded-full" style={{ width: 6, height: 6, background: C.navy }} />
                12-month outlook
              </span>
              {horizonPeriods.length > 0 && (
                <span className="text-[11.5px] font-mono" style={{ color: C.ink3 }}>
                  {monthLabel(horizonPeriods[0])} – {monthLabel(horizonPeriods[horizonPeriods.length - 1])}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
              <KPITile
                tone={linesAtRisk > 0 ? 'warn' : 'lime'}
                icon={AlertTriangle}
                label="Lines at risk"
                value={linesAtRisk}
                footnote={`${criticalLines || 0} critical · ${highLines || 0} high`}
              />
              <KPITile
                tone="navy"
                icon={Activity}
                label="Site utilisation"
                value={overallUtil ?? '—'}
                suffix={overallUtil !== null ? '%' : ''}
                footnote="planned orders (firm + MRP) ÷ capacity"
              />
              <KPITile
                tone={demandCoverage && demandCoverage > 100 ? 'warn' : 'navy'}
                icon={TrendingUp}
                label="Demand vs capacity"
                value={demandCoverage ?? '—'}
                suffix={demandCoverage !== null ? '%' : ''}
                footnote="S&OP forecast ÷ capacity"
              />
              <KPITile
                tone={labourShorts > 0 ? 'warn' : 'lime'}
                icon={Users}
                label="Labour shortfalls"
                value={labourShorts}
                footnote={labourShorts === 0 ? 'no shortfalls' : `line${labourShorts > 1 ? 's' : ''} below required headcount`}
              />
            </div>
          </motion.div>

          {/* Next-month spotlight */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
            className="mt-4 print:mt-2"
          >
            <NextMonthSpotlight lines={allLines} planCycleDate={dashboard.plan_cycle_date} onSelectLine={selectLine} />
          </motion.div>

          {/* Commentary */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl px-6 py-5 mt-4 print:mt-2 print:py-3 print-avoid-break"
            style={{
              background: 'linear-gradient(135deg,#FAFCF9 0%,#F4F8F0 100%)',
              border: `1px solid ${C.border}`,
            }}
          >
            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(180deg,${C.lime},${C.navy})` }} />
            <span
              className="absolute pointer-events-none"
              style={{
                right: -30, top: -30, width: 120, height: 120,
                background: 'radial-gradient(circle,rgba(170,205,0,0.1),transparent 70%)',
              }}
            />

            <div className="relative pl-3.5 flex items-center justify-between mb-2.5 gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.navy }}>
                <span className="rounded-full" style={{ width: 6, height: 6, background: C.lime, boxShadow: '0 0 0 2px rgba(170,205,0,0.2)' }} />
                Commentary
                {isUsingAuto && autoCommentary && (
                  <span
                    className="font-mono text-[9.5px] font-semibold uppercase tracking-widest px-1.5 py-px rounded"
                    style={{ background: 'rgba(170,205,0,0.18)', color: C.limeDeep, letterSpacing: '0.1em' }}
                  >
                    Auto-generated
                  </span>
                )}
              </span>

              <div className="print:hidden inline-flex items-center gap-1">
                <button
                  onClick={regenerateFromData}
                  disabled={!autoCommentary}
                  title="Regenerate commentary from current data"
                  className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-white/60 disabled:opacity-40"
                  style={{ color: C.navy }}
                >
                  <Wand2 className="w-3 h-3" strokeWidth={2.2} />
                  Regenerate
                </button>
                {!isUsingAuto && (
                  <button
                    onClick={resetToAuto}
                    title="Discard manual edit and use auto-generated text"
                    className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-white/60"
                    style={{ color: C.ink3 }}
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => editingCommentary ? setEditingCommentary(false) : startEditing()}
                  className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-white/60"
                  style={{ color: C.ink3 }}
                >
                  <Pencil className="w-3 h-3" />
                  {editingCommentary ? 'Done' : 'Edit'}
                </button>
              </div>
            </div>

            {editingCommentary ? (
              <textarea
                ref={textareaRef}
                value={commentary}
                onChange={(e) => saveCommentary(e.target.value)}
                placeholder="Summarise the current capacity situation, risks, and recommended actions for this planning cycle…"
                rows={6}
                className="relative w-full ml-0 mt-1 resize-y px-3 py-2.5 rounded-lg text-[14px] focus:outline-none focus:ring-2"
                style={{ background: '#fff', border: `1px solid ${C.border2}`, color: C.ink, fontFamily: 'inherit', lineHeight: 1.55, minHeight: 110 }}
              />
            ) : (
              <div onClick={startEditing} className="relative pl-3.5 cursor-pointer print:cursor-default min-h-[60px]">
                {displayCommentary ? (
                  <p
                    className="text-[14px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: C.ink, fontStyle: isUsingAuto ? 'normal' : 'normal' }}
                  >
                    {displayCommentary}
                  </p>
                ) : (
                  <p className="text-[13px] italic print:hidden" style={{ color: C.ink4 }}>
                    Click Regenerate to draft a summary from current data, or Edit to write your own.
                  </p>
                )}
              </div>
            )}
          </motion.div>

          {/* Plant utilisation strip */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}
            className="grid gap-3 mt-4 print:mt-2 print-avoid-break"
            style={{ gridTemplateColumns: `repeat(${Math.max(activePlants.length, 1)}, minmax(0, 1fr))` }}
          >
            {activePlants.map(plant => (
              <PlantUtilisationStrip key={plant} plant={plant} lines={plantGroups[plant]} periods={periodSet} />
            ))}
          </motion.div>

          {/* Plant + Line filter */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
            className="bg-white rounded-2xl px-4 py-3 mt-5 print:hidden"
            style={{ border: `1px solid ${C.border}` }}
          >
            {/* Plant row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-widest w-12 flex-shrink-0" style={{ color: C.ink3 }}>Plant</span>
              <button
                onClick={() => selectPlant(null)}
                className="px-3 py-1 rounded-md text-[12px] font-semibold transition-all"
                style={
                  selectedPlant === null
                    ? { background: C.navy, color: '#fff', border: `1px solid ${C.navy}` }
                    : { background: '#fff', color: C.ink3, border: `1px solid ${C.border}` }
                }
              >
                All
              </button>
              {activePlants.map(plant => (
                <button
                  key={plant}
                  onClick={() => selectPlant(selectedPlant === plant ? null : plant)}
                  className="px-3 py-1 rounded-md text-[12px] font-semibold transition-all"
                  style={
                    selectedPlant === plant
                      ? { background: C.navy, color: '#fff', border: `1px solid ${C.navy}` }
                      : { background: '#fff', color: C.ink3, border: `1px solid ${C.border}` }
                  }
                >
                  {plant}
                </button>
              ))}
            </div>

            {/* Line row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10.5px] font-semibold uppercase tracking-widest w-12 flex-shrink-0" style={{ color: C.ink3 }}>Line</span>
              <button
                onClick={() => selectLine(null)}
                className="px-3 py-1 rounded-md text-[12px] font-semibold transition-all"
                style={
                  selectedLine === null
                    ? { background: C.lime, color: C.navy, border: `1px solid ${C.lime}` }
                    : { background: '#fff', color: C.ink3, border: `1px solid ${C.border}` }
                }
              >
                All
              </button>
              {linesInScope.map(line => {
                const isActive = selectedLine === line.line_code
                return (
                  <button
                    key={line.line_code}
                    onClick={() => selectLine(isActive ? null : line.line_code)}
                    className="px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all"
                    style={
                      isActive
                        ? { background: C.lime, color: C.navy, border: `1px solid ${C.limeDeep}` }
                        : { background: '#fff', color: C.ink3, border: `1px solid ${C.border}` }
                    }
                  >
                    {line.line_code}
                  </button>
                )
              })}
            </div>
          </motion.div>

          {/* Plant charts */}
          <div className="space-y-4 mt-4 print:space-y-3 print:mt-3">
            {chartsToRender.map(({ plant, lines }, i) => (
              <motion.div
                key={`${plant}-${selectedLine ?? 'all'}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04 }}
                className="print-avoid-break"
                style={{ pageBreakInside: 'avoid' }}
              >
                <PlantChart
                  plantCode={plant}
                  lines={lines}
                  planCycleDate={dashboard.plan_cycle_date}
                  unitMode={unitMode}
                />
              </motion.div>
            ))}
          </div>

          {/* Line risk radar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            className="mt-4 print:mt-3"
          >
            <LineRiskRadar
              lines={allLines}
              planCycleDate={dashboard.plan_cycle_date}
              onSelectLine={selectLine}
              selectedLine={selectedLine}
            />
          </motion.div>

          {/* Footer */}
          <p className="mt-8 pt-5 text-[11.5px] text-center flex items-center justify-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.border}`, color: C.ink3 }}>
            <span className="font-bold tracking-tight" style={{ color: C.navy }}>moove</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>RCCP One</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Gravesend UKP1</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Plan cycle {cycleLabel}</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>OEE baseline 55%</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Generated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </p>
        </>
      )}
    </div>
  )
}
