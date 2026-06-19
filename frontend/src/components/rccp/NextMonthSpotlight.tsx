import { CheckCircle2, AlertTriangle, AlertOctagon, ArrowRight } from 'lucide-react'
import type { RCCPLine, RCCPPlantSupportRole, RCCPPoolRoleBalance } from '../../types'
import { C, focusVerdict, focusMonthPeriod, monthLabel, poolFteForMonth, siteMonthHours, type Verdict } from './brand'

function fmtL(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}ML`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}kL`
  return `${Math.round(v)}L`
}

const VERDICT_STYLE: Record<Verdict, { accent: string; bg: string; text: string; icon: React.ElementType; label: string }> = {
  'ON TRACK': { accent: C.lime, bg: C.limeTint, text: C.limeDeep, icon: CheckCircle2, label: 'ON TRACK' },
  'AT RISK':  { accent: C.amber, bg: C.amberLight, text: C.amber, icon: AlertTriangle, label: 'AT RISK' },
  'CRITICAL': { accent: C.red, bg: C.redLight, text: C.red, icon: AlertOctagon, label: 'CRITICAL' },
}

function StatChip({ label, value, suffix = '', tone, sub, tooltip }: {
  label: string; value: string | number; suffix?: string; tone: 'navy' | 'amber' | 'red' | 'lime'; sub?: string; tooltip?: string
}) {
  const color = tone === 'red' ? C.red : tone === 'amber' ? C.amber : tone === 'lime' ? C.limeDeep : C.navy
  return (
    <div
      className="rounded-xl px-3.5 py-2.5 bg-white"
      style={{ border: `1px solid ${C.border}` }}
      title={tooltip}
    >
      <div className="text-[10.5px] font-medium mb-1 flex items-center gap-1" style={{ color: C.ink3 }}>
        {label}
        {tooltip && <span className="opacity-60 cursor-help" style={{ fontSize: 9 }}>ⓘ</span>}
      </div>
      <div className="text-[20px] font-semibold leading-none tabnum" style={{ color, letterSpacing: '-0.02em' }}>
        {value}<span className="text-[12px] font-medium ml-px" style={{ color: C.ink3 }}>{suffix}</span>
      </div>
      {sub && (
        <div className="text-[10.5px] font-mono mt-1 tabnum" style={{ color: C.ink4 }}>{sub}</div>
      )}
    </div>
  )
}

function fmtGBP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `£${(v / 1_000).toFixed(0)}k`
  return `£${Math.round(v)}`
}

export default function NextMonthSpotlight({
  lines, planCycleDate, onSelectLine, poolLabour, cogsPerLitre = 0.12,
}: {
  lines: RCCPLine[]
  planCycleDate: string
  onSelectLine?: (code: string | null) => void
  poolLabour?: Record<string, RCCPPoolRoleBalance[]>
  cogsPerLitre?: number
}) {
  if (!lines.length) return null

  const focus = focusMonthPeriod(planCycleDate)
  const fv = focusVerdict(lines, focus, poolLabour)
  const { verdict, planFeasibility, siteUtilTheoretical, demandCov, over, short,
          productionTotal, firmTotal, plannedTotal,
          deliverableLitres, shortfallLitres, theoreticalCapacity, demandTotal } = fv
  const vs = VERDICT_STYLE[verdict]
  const Icon = vs.icon

  // FTE-equivalent headcount summary for this focus month — from the pool balance.
  const poolM = poolFteForMonth(poolLabour ?? {}, focus)
  const mh = siteMonthHours(lines, focus)
  const fte = { needed: poolM.need, planned: poolM.have, gap: poolM.gap, monthHours: mh.monthHours, workingDays: mh.workingDays }
  const fteTooltip = fte && fte.monthHours > 0
    ? `1 FTE = one person working a standard month. This month: ${fte.workingDays} working days × ${Math.round(fte.monthHours / fte.workingDays)}h shift = ${Math.round(fte.monthHours)}h. Captures part-time, overtime, and partial-month operation that head-counts hide.`
    : '1 FTE = one person working a standard month (calendar-derived). Captures part-time, overtime, and partial-month operation that head-counts hide.'

  const costToClear = shortfallLitres > 0 ? shortfallLitres * cogsPerLitre : 0

  // Recommended action
  let recommendation: string | null = null
  if (verdict === 'CRITICAL' && over.length) {
    const names = over.slice(0, 3).map(o => o.code).join(', ')
    recommendation = `Approve overtime on ${names}${over.length > 3 ? ' and others' : ''}, or shift MRP volume into a later month.`
  } else if (verdict === 'AT RISK') {
    if (short.length) {
      recommendation = `Review the headcount plan for ${short.slice(0, 3).map(s => s.code).join(', ')} before the month locks.`
    } else if (demandCov != null && demandCov > 100) {
      recommendation = `Demand exceeds capacity — confirm firm orders and reprofile MRP proposals.`
    } else {
      recommendation = `Limited headroom — monitor closely and hold contingency for overtime.`
    }
  }

  const LineChip = ({ code, detail, tone }: { code: string; detail: string; tone: 'red' | 'amber' }) => (
    <button
      onClick={() => onSelectLine?.(code)}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-semibold transition-transform hover:-translate-y-px print:cursor-default"
      style={{
        background: tone === 'red' ? C.redLight : C.amberLight,
        color: tone === 'red' ? C.red : C.amber,
        border: `1px solid ${tone === 'red' ? '#F6C9AE' : '#FBD89B'}`,
      }}
    >
      {code}<span className="font-mono font-normal opacity-80">{detail}</span>
    </button>
  )

  return (
    <div
      className="relative overflow-hidden rounded-2xl print-avoid-break"
      style={{ background: '#FFFFFF', border: `1px solid ${C.border}` }}
    >
      {/* Verdict accent rail */}
      <span className="absolute left-0 top-0 bottom-0" style={{ width: 5, background: vs.accent }} />

      <div className="pl-6 pr-5 py-5">
        <div className="flex items-start justify-between gap-5 flex-wrap">
          {/* Verdict block */}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: C.ink3 }}>
                Planning month
              </div>
              <div className="text-[22px] font-semibold leading-none" style={{ color: C.navy, letterSpacing: '-0.02em' }}>
                {monthLabel(focus)}
              </div>
            </div>
            <span
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[15px] font-bold uppercase tracking-wide"
              style={{ background: vs.bg, color: vs.text, border: `1px solid ${vs.accent}` }}
            >
              <Icon className="w-5 h-5" strokeWidth={2.4} />
              {vs.label}
            </span>
          </div>

          {/* 4 stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 min-w-[300px]">
            {/* 1. Production plan — what we're committing to make */}
            <StatChip
              label="Production plan"
              value={productionTotal > 0 ? fmtL(productionTotal) : '—'}
              tone="navy"
              sub={productionTotal > 0
                ? `firm ${fmtL(firmTotal)} · MRP ${fmtL(plannedTotal)}`
                : undefined}
            />
            {/* 2. Plan feasibility — the actionable headline */}
            <StatChip
              label="Plan feasibility"
              value={planFeasibility ?? '—'}
              suffix={planFeasibility != null ? '%' : ''}
              tone={planFeasibility != null && planFeasibility < 90 ? 'red'
                : planFeasibility != null && planFeasibility < 100 ? 'amber'
                : 'lime'}
              sub={productionTotal > 0
                ? `${fmtL(deliverableLitres)} of ${fmtL(productionTotal)} deliverable`
                : undefined}
              tooltip="% of the plan that fits in current per-line capacity. Below 100% means some demand can't be made on the lines as-is."
            />
            {/* 3. Volume to clear — the gap + cost */}
            <StatChip
              label="Volume to clear"
              value={shortfallLitres > 0 ? fmtL(shortfallLitres) : '—'}
              tone={shortfallLitres > 0 ? 'amber' : 'lime'}
              sub={shortfallLitres > 0
                ? `~${fmtGBP(costToClear)} estimated OT cost`
                : 'plan fits in capacity'}
              tooltip={`Production volume that exceeds current per-line capacity. Cost estimate = shortfall litres × £${cogsPerLitre.toFixed(2)}/L COGS — covers running overtime or an extra shift to clear it.`}
            />
            {/* 4. Headcount — FTE gap */}
            {fte && fte.needed != null ? (
              (() => {
                const isShort = fte.gap != null && fte.gap >= 1
                const fmtFte = (v: number) => (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1))
                // Headline = the headcount we actually have planned (never a bare "0"
                // that reads as "no staff"); need + coverage status go in the sub.
                const headcountSub = fte.planned == null
                  ? `${fmtFte(fte.needed)} FTE needed · no headcount plan`
                  : isShort
                    ? `Need ${fmtFte(fte.needed)} · ${fte.gap!.toFixed(1)} FTE short`
                    : `Need ${fmtFte(fte.needed)} · fully covered`
                return (
                  <StatChip
                    label="Headcount planned"
                    value={fte.planned != null ? fmtFte(fte.planned) : '—'}
                    suffix={fte.planned != null ? ' FTE' : ''}
                    tone={isShort ? 'amber' : 'lime'}
                    sub={headcountSub}
                    tooltip={fteTooltip}
                  />
                )
              })()
            ) : (
              <StatChip
                label="Short-staffed"
                value={short.length}
                tone={short.length > 0 ? 'amber' : 'lime'}
                tooltip="Lines with a material labour shortfall (≥ 1 FTE gap) in the planning month."
              />
            )}
          </div>
        </div>

        {/* Theoretical-max sub-line — the optimisation lever */}
        {siteUtilTheoretical != null && theoreticalCapacity != null && productionTotal > 0 && (
          <p className="text-[11px] mt-2" style={{ color: C.ink4 }}>
            Theoretical capacity used <span className="font-mono font-semibold tabnum" style={{ color: C.ink3 }}>{siteUtilTheoretical}%</span> ({fmtL(productionTotal)} of {fmtL(theoreticalCapacity)} raw — what you'd see if mix could rebalance freely across lines).
          </p>
        )}

        {/* FTE definition — visible explainer */}
        {fte && fte.monthHours > 0 && (
          <div
            className="mt-2 px-3 py-2 rounded-lg flex items-start gap-2"
            style={{ background: C.navyTint, border: `1px solid ${C.border}` }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full flex-shrink-0 font-mono font-bold"
              style={{ width: 16, height: 16, background: C.navy, color: '#fff', fontSize: 10, marginTop: 1 }}
              aria-hidden
            >
              i
            </span>
            <p className="text-[11.5px]" style={{ color: C.ink2 }}>
              <strong style={{ color: C.navy }}>FTE = full-time equivalent.</strong>
              {' '}One FTE = one person working a standard month — for {monthLabel(focus)} that's{' '}
              <span className="font-mono font-semibold tabnum" style={{ color: C.navy }}>{fte.workingDays} working days × {Math.round(fte.monthHours / Math.max(fte.workingDays, 1))}h shift = {Math.round(fte.monthHours)}h</span>.
              Captures part-time, overtime and partial-month operation that head-counts hide. <em>−2 FTE</em> means we need 2 more people-months of work than the headcount plan currently covers.
            </p>
          </div>
        )}

        {/* Named offenders + recommendation */}
        <div className="mt-4 pt-3.5 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
          {over.length === 0 && short.length === 0 ? (
            <p className="text-[13px]" style={{ color: C.limeDeep }}>
              All lines within capacity and fully staffed for {monthLabel(focus)}.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {over.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold w-[92px] flex-shrink-0" style={{ color: C.ink3 }}>Over capacity</span>
                  {over.slice(0, 8).map(o => (
                    <LineChip key={o.code} code={o.code} detail={` ${o.util}%`} tone="red" />
                  ))}
                </div>
              )}
              {short.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold w-[92px] flex-shrink-0" style={{ color: C.ink3 }}>Short-staffed</span>
                  {short.slice(0, 8).map(s => (
                    <LineChip key={s.code} code={s.code} detail={s.shortfall ? ` −${s.shortfall.toFixed(1)} FTE` : ''} tone="amber" />
                  ))}
                </div>
              )}
            </div>
          )}

          {recommendation && (
            <p className="flex items-start gap-1.5 text-[12.5px] mt-0.5" style={{ color: C.ink2 }}>
              <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: vs.accent }} strokeWidth={2.4} />
              <span>{recommendation}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
