import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar,
} from 'recharts'
import { ArrowUpRight, Package } from 'lucide-react'
import type { RCCPLine, RCCPPortfolioChange } from '../../types'
import { C, monthLabel, shortMonth, shortYear } from './brand'

// Phase-in — information only.
// The phase-in file lists the SKUs being launched. This panel highlights those
// SKUs' monthly volume or hours as they appear in the production plan
// (production_orders) — the added requirement, per plant / line. The unit
// (Litres / Hours) follows the global switch at the top of the Executive Summary.

type UnitMode = 'L' | 'h'
const unitLabel = (u: UnitMode) => (u === 'h' ? 'Hours' : 'Litres')

function unitVal(m: RCCPPortfolioChange['monthly'][string] | undefined, u: UnitMode): number {
  if (!m) return 0
  return u === 'h' ? (m.hours ?? 0) : m.litres
}

function fmt(v: number, u: UnitMode): string {
  const a = Math.abs(v)
  if (u === 'h') return `${v.toFixed(a >= 100 ? 0 : 1)}h`
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M L`
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}k L`
  return `${Math.round(v)} L`
}

function fmtAxis(v: number, u: UnitMode): string {
  const a = Math.abs(v)
  if (u === 'h') return `${Math.round(v)}`
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return `${Math.round(v)}`
}

// Total a SKU's plan contribution across the horizon, in the selected unit.
function changeTotal(c: RCCPPortfolioChange, periods: string[], u: UnitMode): number {
  return periods.reduce((s, p) => s + unitVal(c.monthly[p], u), 0)
}

type Row = {
  period: string
  label: string
  vol: number
  items: { c: RCCPPortfolioChange; v: number }[]
}

function ChartTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Row }[]; unit: UnitMode }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (row.items.length === 0) return null
  return (
    <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: '#fff', border: `1px solid ${C.border2}`, boxShadow: '0 4px 14px rgba(0,0,0,0.10)', maxWidth: 280 }}>
      <div className="font-semibold mb-1" style={{ color: C.navy }}>{monthLabel(row.period)}</div>
      {row.items.map(({ c, v }, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3">
          <span style={{ color: C.limeDeep }}>▲ {c.item_code ?? '—'}{c.line_code ? ` · ${c.line_code}` : ''}</span>
          <span style={{ color: C.ink2 }}>+{fmt(v, unit)}</span>
        </div>
      ))}
    </div>
  )
}

function EventRow({ c, total, unit }: { c: RCCPPortfolioChange; total: number; unit: UnitMode }) {
  const effLabel = c.effective_period ? monthLabel(c.effective_period) : (c.effective_date ?? '—')
  return (
    <div className="flex items-start gap-3 py-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
      <span className="flex-shrink-0 inline-flex items-center justify-center rounded-md mt-0.5"
        style={{ width: 24, height: 24, background: C.limeTint, color: C.limeDeep }}>
        <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[13.5px]">
            <span className="font-semibold" style={{ color: C.navy }}>{c.item_code ?? '—'}</span>
            <span className="text-[11.5px] ml-2" style={{ color: C.ink3 }}>{effLabel}</span>
            {c.line_code && (
              <span className="ml-2 inline-block font-mono text-[11px] px-1.5 py-px rounded"
                style={{ background: C.navyTint, color: C.navy }}>{c.line_code}</span>
            )}
          </span>
          {total > 0 && (
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: C.limeDeep }}>
              +{fmt(total, unit)}
            </span>
          )}
        </div>
        {c.description && (
          <p className="text-[11.5px] mt-0.5" style={{ color: C.ink3 }}>{c.description}</p>
        )}
      </div>
    </div>
  )
}

export default function PortfolioPanel({
  changes,
  lines,
  horizon,
  unitMode,
}: {
  changes: RCCPPortfolioChange[]
  lines: RCCPLine[]
  horizon: string[]
  unitMode: UnitMode
}) {
  const [plant, setPlant] = useState<string>('')   // '' = all plants
  const [line, setLine] = useState<string>('')     // '' = all lines in scope

  const plants = useMemo(() => Array.from(new Set(lines.map(l => l.plant_code))).sort(), [lines])
  const linesInScope = useMemo(
    () => lines.filter(l => !plant || l.plant_code === plant).map(l => l.line_code).sort(),
    [lines, plant],
  )

  // Phase-ins only (exclude any legacy DISCONTINUE rows).
  const phaseIns = useMemo(
    () => changes.filter(c => c.change_type !== 'DISCONTINUE'),
    [changes],
  )
  const inScope = (c: RCCPPortfolioChange) => {
    if (line) return c.line_code === line
    if (plant) return c.plant_code === plant
    return true
  }
  const scoped = useMemo(() => phaseIns.filter(inScope), [phaseIns, plant, line])
  const periods = horizon

  const rows = useMemo<Row[]>(() => periods.map(p => {
    const items: Row['items'] = []
    for (const c of scoped) {
      const v = unitVal(c.monthly[p], unitMode)
      if (v > 0) items.push({ c, v })
    }
    return {
      period: p,
      label: `${shortMonth(p)} ${shortYear(p)}`,
      vol: items.reduce((s, x) => s + x.v, 0),
      items,
    }
  }), [scoped, periods, unitMode])

  const hasAny = scoped.length > 0
  const hasBars = rows.some(r => r.vol > 0)

  return (
    <div className="bg-white rounded-2xl px-5 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            Phase-in — added {unitMode === 'h' ? 'hours' : 'volume'}
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            SKUs being phased in ▲ and the load they add, by month · for information — volume flows via S&OP → MRP
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={plant} onChange={(e) => { setPlant(e.target.value); setLine('') }}
            className="text-[12px] rounded-lg px-2 py-1.5 border outline-none" style={{ borderColor: C.border2, color: C.navy }}>
            <option value="">All plants</option>
            {plants.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={line} onChange={(e) => setLine(e.target.value)}
            className="text-[12px] rounded-lg px-2 py-1.5 border outline-none" style={{ borderColor: C.border2, color: C.navy }}>
            <option value="">All lines</option>
            {linesInScope.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {!hasAny ? (
        <div className="flex items-center gap-3 py-6 px-4 rounded-xl" style={{ background: '#FAFAF9', border: `1px dashed ${C.border2}` }}>
          <Package className="w-5 h-5" style={{ color: C.ink4 }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: C.navy }}>No phase-ins in scope</p>
            <p className="text-[12px] mt-0.5" style={{ color: C.ink3 }}>No launches for the current plant/line selection.</p>
          </div>
        </div>
      ) : (
        <>
          {hasBars ? (
            <>
              <div className="flex items-center gap-5 mb-2 text-[11.5px]" style={{ color: C.ink2 }}>
                <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: C.lime }} /> phase-in ({scoped.length})</span>
                <span style={{ color: C.ink3 }}>· {unitLabel(unitMode)}</span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border2 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => fmtAxis(Number(v), unitMode)} width={48} />
                  <Tooltip content={<ChartTooltip unit={unitMode} />} cursor={{ fill: 'rgba(170,205,0,0.06)' }} />
                  <Bar dataKey="vol" name="Phase-in" fill={C.lime} radius={[3, 3, 0, 0]} maxBarSize={34} />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="flex items-center gap-3 py-5 px-4 rounded-xl mb-1" style={{ background: '#FAFAF9', border: `1px dashed ${C.border2}` }}>
              <Package className="w-5 h-5" style={{ color: C.ink4 }} />
              <p className="text-[12px]" style={{ color: C.ink3 }}>
                Phase-in SKUs have no volume in the production plan for this selection — check that the production orders include these launches.
              </p>
            </div>
          )}

          <div className="mt-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.limeDeep }}>Phase-ins</p>
            {scoped.map((c, i) => <EventRow key={i} c={c} total={changeTotal(c, periods, unitMode)} unit={unitMode} />)}
          </div>
        </>
      )}
    </div>
  )
}
