import { CheckCircle2, AlertTriangle, AlertOctagon, ArrowRight } from 'lucide-react'
import type { RCCPLine } from '../../types'
import { C, focusVerdict, focusMonthPeriod, monthLabel, type Verdict } from './brand'

const VERDICT_STYLE: Record<Verdict, { accent: string; bg: string; text: string; icon: React.ElementType; label: string }> = {
  'ON TRACK': { accent: C.lime, bg: C.limeTint, text: C.limeDeep, icon: CheckCircle2, label: 'ON TRACK' },
  'AT RISK':  { accent: C.amber, bg: C.amberLight, text: C.amber, icon: AlertTriangle, label: 'AT RISK' },
  'CRITICAL': { accent: C.red, bg: C.redLight, text: C.red, icon: AlertOctagon, label: 'CRITICAL' },
}

function StatChip({ label, value, suffix = '', tone }: {
  label: string; value: string | number; suffix?: string; tone: 'navy' | 'amber' | 'red' | 'lime'
}) {
  const color = tone === 'red' ? C.red : tone === 'amber' ? C.amber : tone === 'lime' ? C.limeDeep : C.navy
  return (
    <div className="rounded-xl px-3.5 py-2.5 bg-white" style={{ border: `1px solid ${C.border}` }}>
      <div className="text-[10.5px] font-medium mb-1" style={{ color: C.ink3 }}>{label}</div>
      <div className="text-[20px] font-semibold leading-none tabnum" style={{ color, letterSpacing: '-0.02em' }}>
        {value}<span className="text-[12px] font-medium ml-px" style={{ color: C.ink3 }}>{suffix}</span>
      </div>
    </div>
  )
}

export default function NextMonthSpotlight({
  lines, planCycleDate, onSelectLine,
}: {
  lines: RCCPLine[]
  planCycleDate: string
  onSelectLine?: (code: string | null) => void
}) {
  if (!lines.length) return null

  const focus = focusMonthPeriod(planCycleDate)
  const { verdict, siteUtil, demandCov, over, short } = focusVerdict(lines, focus)
  const vs = VERDICT_STYLE[verdict]
  const Icon = vs.icon

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

          {/* Stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1 min-w-[300px]">
            <StatChip label="Site utilisation" value={siteUtil ?? '—'} suffix={siteUtil != null ? '%' : ''}
              tone={siteUtil != null && siteUtil >= 100 ? 'red' : siteUtil != null && siteUtil >= 90 ? 'amber' : 'navy'} />
            <StatChip label="Demand vs capacity" value={demandCov ?? '—'} suffix={demandCov != null ? '%' : ''}
              tone={demandCov != null && demandCov > 100 ? 'red' : 'navy'} />
            <StatChip label="Over capacity" value={over.length}
              tone={over.length > 0 ? 'red' : 'lime'} />
            <StatChip label="Short-staffed" value={short.length}
              tone={short.length > 0 ? 'amber' : 'lime'} />
          </div>
        </div>

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
                    <LineChip key={s.code} code={s.code} detail={s.shortfall ? ` −${Math.round(s.shortfall)} ops` : ''} tone="amber" />
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
