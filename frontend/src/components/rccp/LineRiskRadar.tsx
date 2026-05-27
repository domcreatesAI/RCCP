import { Users } from 'lucide-react'
import type { RCCPLine } from '../../types'
import {
  C, RISK_TONE, RISK_RANK, utilTone, rollingMonths, focusMonthPeriod,
  shortMonth, shortYear, lineHeadline, displayStatus,
  type RiskStatus, type LineHeadline,
} from './brand'

// ─── Sparkline geometry — bars fill the column width (responsive) ────────────────
const H_BARS = 56
const H_TICK = 6
const SCALE_MAX = 135   // util % that fills the bar to full height

// Shared grid: line | risk pill | sparkline (fills) | peak·staffing
const labelW = 104
const pillW = 78
const headlineW = 172

function Sparkline({ line, periods, focusPeriod }: {
  line: RCCPLine
  periods: string[]
  focusPeriod: string
}) {
  const ref100Bottom = H_TICK + (100 / SCALE_MAX) * H_BARS
  return (
    <div className="relative w-full" style={{ height: H_BARS + H_TICK }}>
      {/* baseline */}
      <div className="absolute left-0 right-0" style={{ bottom: H_TICK, height: 1, background: C.border }} />
      {/* 100% reference */}
      <div className="absolute left-0 right-0" style={{ bottom: ref100Bottom, borderTop: `1px dashed ${C.ink4}`, opacity: 0.55 }} />

      <div className="absolute inset-0 flex">
        {periods.map(p => {
          const m = line.monthly.find(x => x.period === p)
          const util = m?.utilisation_pct ?? null
          const short = (m?.hc_shortfall ?? 0) >= 1
          const isFocus = p === focusPeriod
          const barH = util != null ? Math.max((Math.min(util, SCALE_MAX) / SCALE_MAX) * H_BARS, 2) : 0
          const tip = `${line.line_code} · ${shortMonth(p)} ${shortYear(p)}: ${util != null ? `${util}%` : 'no data'}${short ? ` · short ${Math.round(m!.hc_shortfall!)} ops` : ''}`
          const barStyle = { left: '50%', transform: 'translateX(-50%)', width: '52%', maxWidth: 30, minWidth: 7 } as const
          return (
            <div key={p} className="relative flex-1" title={tip}>
              {isFocus && <div className="absolute inset-0" style={{ background: 'rgba(12,60,93,0.07)', borderRadius: 4 }} />}
              {util != null ? (
                <div className="absolute" style={{ ...barStyle, bottom: H_TICK, height: barH, background: utilTone(util).bg, borderRadius: '2px 2px 0 0' }} />
              ) : (
                <div className="absolute" style={{ ...barStyle, bottom: H_TICK, height: 3, background: '#E2E6EA', borderRadius: 1 }} />
              )}
              {short && <div className="absolute" style={{ ...barStyle, bottom: 0, height: H_TICK - 2, background: C.red, borderRadius: 1 }} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthAxis({ periods, focusPeriod }: { periods: string[]; focusPeriod: string }) {
  return (
    <div className="flex w-full">
      {periods.map(p => {
        const isFocus = p === focusPeriod
        return (
          <div key={p} className="flex-1 text-center">
            <span className="text-[10px]" style={{ color: isFocus ? C.navy : C.ink4, fontWeight: isFocus ? 700 : 500 }}>
              {shortMonth(p)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function RadarRow({ line, periods, focusPeriod, status, hl, cols, selected, dimmed, onSelectLine }: {
  line: RCCPLine
  periods: string[]
  focusPeriod: string
  status: RiskStatus
  hl: LineHeadline
  cols: string
  selected: boolean
  dimmed: boolean
  onSelectLine?: (code: string | null) => void
}) {
  const { peakUtil, peakPeriod, worstShort, shortPeriod } = hl
  const tone = RISK_TONE[status]
  const peakColor = peakUtil == null ? C.ink3
    : peakUtil >= 100 ? C.red : peakUtil >= 90 ? C.amber : peakUtil >= 75 ? '#A16207' : C.limeDeep

  const isShort = worstShort > 0 && !!shortPeriod
  const noPlan = line.labour_status === 'NO_DATA'

  return (
    <button
      onClick={() => onSelectLine?.(selected ? null : line.line_code)}
      className="w-full text-left transition-colors hover:bg-[#F7F7F5] print:hover:bg-transparent"
      style={{
        display: 'grid', gridTemplateColumns: cols, columnGap: 16, alignItems: 'center',
        padding: '10px 12px', borderTop: `1px solid ${C.border}`,
        opacity: dimmed ? 0.4 : 1,
        background: selected ? C.navyTint : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${C.navy}` : 'none',
      }}
    >
      {/* Status dot + line */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, background: tone.dot }} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight" style={{ color: C.navy }}>{line.line_code}</div>
          <div className="text-[11px] leading-tight" style={{ color: C.ink4 }}>{line.plant_code}</div>
        </div>
      </div>

      {/* Risk pill */}
      <span
        className="text-[10.5px] font-semibold uppercase tracking-wider px-2 py-1 rounded text-center"
        style={{ background: tone.bg, color: tone.text }}
      >
        {status}
      </span>

      {/* Sparkline (fills available width) */}
      <Sparkline line={line} periods={periods} focusPeriod={focusPeriod} />

      {/* Headline */}
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-mono font-semibold tabnum whitespace-nowrap" style={{ color: peakColor }}>
            {peakUtil != null ? `${peakUtil}%` : '—'}
          </span>
          <span className="text-[11.5px] whitespace-nowrap" style={{ color: C.ink3 }}>
            peak{peakPeriod ? ` · ${shortMonth(peakPeriod)} ${shortYear(peakPeriod)}` : ''}
          </span>
        </div>
        {isShort ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap" style={{ color: C.red }}>
            <Users className="w-3.5 h-3.5" strokeWidth={2.2} />
            −{Math.round(worstShort)} ops · {shortMonth(shortPeriod!)}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap" style={{ color: noPlan ? C.ink4 : C.ink3 }}>
            <Users className="w-3.5 h-3.5" strokeWidth={1.8} />
            {noPlan ? 'no HC plan' : 'staffing OK'}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function LineRiskRadar({
  lines, planCycleDate, onSelectLine, selectedLine,
}: {
  lines: RCCPLine[]
  planCycleDate: string
  onSelectLine?: (code: string | null) => void
  selectedLine?: string | null
}) {
  if (!lines.length) return null

  const periods = rollingMonths(planCycleDate, 12)
  const focus = focusMonthPeriod(planCycleDate)
  const cols = `${labelW}px ${pillW}px 1fr ${headlineW}px`

  // Coherent display status per line (capacity peak + material labour gap), worst-first.
  const rows = lines
    .map(line => {
      const hl = lineHeadline(line, periods)
      return { line, hl, status: displayStatus(hl.peakUtil, hl.worstShort) }
    })
    .sort((a, b) =>
      (RISK_RANK[b.status] - RISK_RANK[a.status]) ||
      ((b.hl.peakUtil ?? -1) - (a.hl.peakUtil ?? -1))
    )

  return (
    <div className="bg-white rounded-2xl px-5 sm:px-6 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-4 flex-wrap">
        <div>
          <h2 className="text-[17px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            Line Risk Radar
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            {lines.length} lines · 12 rolling months from {shortMonth(periods[0])} {shortYear(periods[0])} · bars = capacity, ticks = headcount · sorted by risk
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-[11px]" style={{ color: C.ink3 }}>
          <div className="flex items-center gap-3 flex-wrap">
            {(['Critical', 'High', 'Watch', 'Stable'] as const).map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="rounded-full" style={{ width: 8, height: 8, background: RISK_TONE[s].dot }} />
                {s}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-end gap-0.5" style={{ height: 12 }}>
                <span style={{ width: 4, height: 5, background: C.lime }} />
                <span style={{ width: 4, height: 8, background: '#F2C94C' }} />
                <span style={{ width: 4, height: 12, background: C.red }} />
              </span>
              bar = utilisation
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 4, background: C.red, display: 'inline-block', borderRadius: 1 }} />
              staffing gap
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 12, height: 12, background: 'rgba(12,60,93,0.1)', border: `1px solid ${C.navy}`, borderRadius: 3, display: 'inline-block' }} />
              planning month
            </span>
          </div>
        </div>
      </div>

      {/* Month axis (aligned over the sparkline column) */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 16, alignItems: 'end' }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest self-end" style={{ color: C.ink4 }}>Line</span>
        <span />
        <MonthAxis periods={periods} focusPeriod={focus} />
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.ink4 }}>Peak · Staffing</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {rows.map(({ line, hl, status }) => (
          <RadarRow
            key={line.line_code}
            line={line}
            periods={periods}
            focusPeriod={focus}
            status={status}
            hl={hl}
            cols={cols}
            selected={selectedLine === line.line_code}
            dimmed={!!selectedLine && selectedLine !== line.line_code}
            onSelectLine={onSelectLine}
          />
        ))}
      </div>
    </div>
  )
}
