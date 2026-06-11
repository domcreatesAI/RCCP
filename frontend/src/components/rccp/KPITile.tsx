import type React from 'react'
import { C } from './brand'

// Shared KPI tile — used by the Exec Summary's 12-month outlook block and the
// People-fit panel. Keep this component agnostic of any specific KPI: the page
// computes the value/footnote/tone and passes them in.

export type KPITileTone = 'navy' | 'warn' | 'lime'

interface Props {
  label: string
  value: string | number
  suffix?: string
  delta?: 'up' | 'down' | null
  deltaLabel?: string
  footnote?: string
  tone: KPITileTone
  icon: React.ElementType
}

export default function KPITile({
  label, value, suffix = '', delta, deltaLabel, footnote, tone, icon: Icon,
}: Props) {
  const ruleColor = tone === 'warn' ? C.red : tone === 'lime' ? C.lime : C.navy
  const numColor  = tone === 'warn' ? C.red : tone === 'lime' ? C.limeDeep : C.navy
  const icoBg    = tone === 'warn' ? C.redLight : tone === 'lime' ? C.limeTint : C.navyTint
  const icoColor = tone === 'warn' ? C.red : tone === 'lime' ? C.limeDeep : C.navy

  const deltaClass = delta === 'up'
    ? { background: C.redLight, color: C.red }
    : delta === 'down'
    ? { background: C.greenLight, color: C.green }
    : null

  // For verdict-style tiles where `value` is a short word like "ALL CLEAR",
  // shrink the font slightly so it fits on one line.
  const isWord = typeof value === 'string' && value.replace(/\s/g, '').length > 4
  const valueSize = isWord ? 22 : 32

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
        <span
          className="font-semibold leading-none tabnum"
          style={{ color: numColor, letterSpacing: '-0.025em', fontSize: valueSize }}
        >
          {value}
          {suffix && <span className="text-[18px] font-medium ml-px" style={{ color: C.ink3 }}>{suffix}</span>}
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
