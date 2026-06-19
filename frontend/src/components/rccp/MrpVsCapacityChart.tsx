import { useMemo } from 'react'
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Line,
} from 'recharts'
import type { RCCPLine } from '../../types'
import { C, rollingMonths, shortMonth, shortYear, monthLabel } from './brand'
import { formatLarge } from './PlantChart'
import { planAndCap, type UnitMode } from './execInsights'

// Executive-summary hero: site planned production (MRP = firm YPAC + MRP LA) vs
// the capacity ceiling, next 12 months. The plan area turns red where it exceeds
// capacity — the at-a-glance "can we execute the plan" signal.

type Row = {
  period: string
  label: string
  plan: number
  capacity: number | null
  base: number     // min(plan, capacity) — navy
  over: number     // max(0, plan - capacity) — red
}

function HeroTooltip({ active, payload, unit }: {
  active?: boolean
  payload?: { payload: Row }[]
  unit: UnitMode
}) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const overload = r.capacity != null && r.plan > r.capacity
  return (
    <div className="bg-white px-3.5 py-2.5 text-[12px] min-w-[180px]"
      style={{ border: `1px solid ${C.border2}`, borderRadius: 10, boxShadow: '0 4px 12px rgba(12,60,93,0.08)' }}>
      <p className="font-semibold mb-1.5 pb-1.5 flex items-center justify-between"
        style={{ color: C.navy, borderBottom: `1px solid ${C.border}` }}>
        <span>{monthLabel(r.period)}</span>
        <span className="font-mono text-[10.5px] font-medium" style={{ color: overload ? C.red : C.ink3 }}>
          {overload ? 'OVER' : 'OK'}
        </span>
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: C.ink2 }}>Plan (MRP)</span>
          <span className="font-mono font-semibold tabnum" style={{ color: overload ? C.red : C.ink }}>{formatLarge(r.plan, unit)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span style={{ color: C.ink2 }}>Capacity</span>
          <span className="font-mono font-semibold tabnum" style={{ color: C.ink }}>{r.capacity != null ? formatLarge(r.capacity, unit) : '—'}</span>
        </div>
        {overload && (
          <div className="flex items-center justify-between gap-3">
            <span style={{ color: C.red }}>Over by</span>
            <span className="font-mono font-semibold tabnum" style={{ color: C.red }}>{formatLarge(r.over, unit)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MrpVsCapacityChart({
  lines,
  planCycleDate,
  unitMode,
}: {
  lines: RCCPLine[]
  planCycleDate: string
  unitMode: UnitMode
}) {
  const rows = useMemo<Row[]>(() => {
    const periods = rollingMonths(planCycleDate, 12)
    return periods.map(period => {
      let plan = 0, cap = 0, anyCap = false
      for (const l of lines) {
        const m = l.monthly.find(x => x.period === period)
        if (!m) continue
        const pc = planAndCap(m, unitMode)
        plan += pc.plan
        if (pc.cap != null) { cap += pc.cap; anyCap = true }
      }
      const capacity = anyCap ? cap : null
      const over = capacity != null ? Math.max(0, plan - capacity) : 0
      const base = capacity != null ? Math.min(plan, capacity) : plan
      return { period, label: `${shortMonth(period)} ${shortYear(period)}`, plan, capacity, base, over }
    })
  }, [lines, planCycleDate, unitMode])

  const overMonths = rows.filter(r => r.over > 0).length

  return (
    <div className="bg-white rounded-2xl px-5 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            MRP vs Capacity — next 12 months
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            Planned production (firm + MRP) against the capacity ceiling, site total · red where the plan exceeds capacity
          </p>
        </div>
        <div className="flex items-center gap-x-4 gap-y-1 text-[11.5px] font-medium flex-wrap" style={{ color: C.ink3 }}>
          <span className="flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 11, height: 11, background: C.navy }} /> Plan (MRP)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block rounded-sm" style={{ width: 11, height: 11, background: C.red }} /> Over capacity</span>
          <span className="flex items-center gap-1.5"><span className="inline-block" style={{ width: 18, borderTop: `2px dashed ${C.ink2}` }} /> Capacity</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F2F5" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border2 }} tickLine={false} />
          <YAxis tickFormatter={(v) => formatLarge(v as number, unitMode)}
            tick={{ fontSize: 10, fill: C.ink3 }} axisLine={false} tickLine={false} width={52} />
          <Tooltip content={(p) => <HeroTooltip active={p.active} payload={p.payload as unknown as { payload: Row }[]} unit={unitMode} />}
            cursor={{ fill: 'rgba(12,60,93,0.04)' }} />
          {/* Plan = base (navy) + over (red), stacked → total height is the plan */}
          <Area type="monotone" dataKey="base" name="base" stackId="plan" stroke={C.navy} fill={C.navy} fillOpacity={0.16} strokeWidth={2} isAnimationActive={false} />
          <Area type="monotone" dataKey="over" name="over" stackId="plan" stroke={C.red} fill={C.red} fillOpacity={0.28} strokeWidth={0} isAnimationActive={false} />
          {/* Capacity ceiling */}
          <Line type="monotone" dataKey="capacity" name="capacity" stroke={C.ink2} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[11px] mt-2" style={{ color: C.ink4 }}>
        {overMonths > 0
          ? `Plan exceeds capacity in ${overMonths} of 12 months — see the decisions below.`
          : 'Plan fits within capacity across the next 12 months.'}
      </p>
    </div>
  )
}
