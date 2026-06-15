import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Bar, Scatter,
} from 'recharts'
import { Package } from 'lucide-react'
import type { RCCPLine, RCCPPortfolioChange } from '../../types'
import { C, rollingMonths, shortMonth, shortYear, monthLabel } from './brand'

// Portfolio changes chart for the Executive Summary.
// Bars = initial demand volume (EA) for NEW_LAUNCH SKUs per month.
// Phase-outs (DISCONTINUE) carry no volume — shown as markers on the axis.
// Plant-level by default, with a line selector. Informational only:
// the actual demand flows through S&OP / MRP, not from this chart.

function fmtEA(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return `${Math.round(v)}`
}

type Row = {
  period: string
  label: string
  launch: number
  launchCount: number
  phaseOutCount: number
  phaseOutY: number | null
  launches: RCCPPortfolioChange[]
  phaseOuts: RCCPPortfolioChange[]
}

// Downward triangle marker for phase-out months, drawn just above the axis.
function PhaseOutMarker(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props
  if (cx == null || cy == null) return null
  const s = 5
  const top = cy - 12
  return (
    <polygon
      points={`${cx - s},${top} ${cx + s},${top} ${cx},${top + s * 1.6}`}
      fill={C.ink3}
      stroke="#fff"
      strokeWidth={0.8}
    />
  )
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (row.launchCount === 0 && row.phaseOutCount === 0) return null
  return (
    <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: '#fff', border: `1px solid ${C.border2}`, boxShadow: '0 4px 14px rgba(0,0,0,0.10)', maxWidth: 260 }}>
      <div className="font-semibold mb-1" style={{ color: C.navy }}>{monthLabel(row.period)}</div>
      {row.launches.map((c, i) => (
        <div key={`l${i}`} className="flex items-baseline justify-between gap-3">
          <span style={{ color: C.limeDeep }}>▲ {c.item_code ?? '—'}</span>
          <span style={{ color: C.ink2 }}>{c.initial_demand != null ? `${fmtEA(c.initial_demand)} EA` : '—'}</span>
        </div>
      ))}
      {row.phaseOuts.map((c, i) => (
        <div key={`p${i}`} className="flex items-baseline justify-between gap-3">
          <span style={{ color: C.ink3 }}>▽ {c.item_code ?? '—'}</span>
          <span style={{ color: C.ink3 }}>phase-out</span>
        </div>
      ))}
    </div>
  )
}

export default function PortfolioChangesChart({
  changes,
  lines,
  planCycleDate,
}: {
  changes: RCCPPortfolioChange[]
  lines: RCCPLine[]
  planCycleDate: string
}) {
  const [plant, setPlant] = useState<string>('')   // '' = all plants
  const [line, setLine] = useState<string>('')     // '' = all lines in scope

  const plants = useMemo(
    () => Array.from(new Set(lines.map(l => l.plant_code))).sort(),
    [lines],
  )
  const linesInScope = useMemo(
    () => lines.filter(l => !plant || l.plant_code === plant).map(l => l.line_code).sort(),
    [lines, plant],
  )

  const rows = useMemo<Row[]>(() => {
    const periods = rollingMonths(planCycleDate, 12)
    const inScope = (c: RCCPPortfolioChange) => {
      if (line) return c.line_code === line
      if (plant) return c.plant_code === plant
      return true
    }
    return periods.map(p => {
      const launches = changes.filter(c => c.change_type === 'NEW_LAUNCH' && c.effective_period === p && inScope(c))
      const phaseOuts = changes.filter(c => c.change_type === 'DISCONTINUE' && c.effective_period === p && inScope(c))
      const launch = launches.reduce((s, c) => s + (c.initial_demand ?? 0), 0)
      return {
        period: p,
        label: `${shortMonth(p)} ${shortYear(p)}`,
        launch,
        launchCount: launches.length,
        phaseOutCount: phaseOuts.length,
        phaseOutY: phaseOuts.length ? 0 : null,
        launches,
        phaseOuts,
      }
    })
  }, [changes, planCycleDate, plant, line])

  const totalLaunchVol = rows.reduce((s, r) => s + r.launch, 0)
  const totalLaunches = rows.reduce((s, r) => s + r.launchCount, 0)
  const totalPhaseOuts = rows.reduce((s, r) => s + r.phaseOutCount, 0)
  const hasAny = totalLaunches > 0 || totalPhaseOuts > 0

  return (
    <div className="bg-white rounded-2xl px-5 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            Portfolio changes — launch volume
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            New-launch initial demand (EA) by month · phase-outs marked ▽ · for information — demand flows via S&OP/MRP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={plant}
            onChange={(e) => { setPlant(e.target.value); setLine('') }}
            className="text-[12px] rounded-lg px-2 py-1.5 border outline-none"
            style={{ borderColor: C.border2, color: C.navy }}>
            <option value="">All plants</option>
            {plants.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={line}
            onChange={(e) => setLine(e.target.value)}
            className="text-[12px] rounded-lg px-2 py-1.5 border outline-none"
            style={{ borderColor: C.border2, color: C.navy }}>
            <option value="">All lines</option>
            {linesInScope.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {!hasAny ? (
        <div className="flex items-center gap-3 py-6 px-4 rounded-xl" style={{ background: '#FAFAF9', border: `1px dashed ${C.border2}` }}>
          <Package className="w-5 h-5" style={{ color: C.ink4 }} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: C.navy }}>No portfolio changes in scope</p>
            <p className="text-[12px] mt-0.5" style={{ color: C.ink3 }}>No launches or phase-outs for the current plant/line selection.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-5 mb-2 text-[11.5px]" style={{ color: C.ink2 }}>
            <span><span className="font-semibold" style={{ color: C.limeDeep }}>{totalLaunches}</span> launches · {fmtEA(totalLaunchVol)} EA</span>
            <span><span className="font-semibold" style={{ color: C.ink3 }}>{totalPhaseOuts}</span> phase-outs</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={rows} margin={{ top: 12, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.ink3 }} axisLine={{ stroke: C.border2 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: C.ink3 }} axisLine={false} tickLine={false}
                tickFormatter={(v) => fmtEA(Number(v))} width={44} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(170,205,0,0.06)' }} />
              <Bar dataKey="launch" name="Launch volume (EA)" fill={C.lime} radius={[3, 3, 0, 0]} maxBarSize={34} />
              <Scatter dataKey="phaseOutY" shape={<PhaseOutMarker />} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
