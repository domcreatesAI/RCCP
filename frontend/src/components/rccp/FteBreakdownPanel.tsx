import { useState } from 'react'
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react'
import type { RCCPLine, RCCPPlantSupportRole } from '../../types'
import { C, fteSummary, focusMonthPeriod, monthLabel } from './brand'

// Per-line FTE breakdown — shows the build-up so the headcount figure can be
// audited. (production hours × per-line crew) ÷ FTE-month-hours per line,
// plus the per-plant shared-role contributions.

interface Props {
  lines: RCCPLine[]
  plantSupport: Record<string, RCCPPlantSupportRole[]>
  planCycleDate: string
}

function fmtH(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k`
  return Math.round(h).toLocaleString()
}

export default function FteBreakdownPanel({ lines, plantSupport, planCycleDate }: Props) {
  const [expanded, setExpanded] = useState(true)
  const period = focusMonthPeriod(planCycleDate)
  const fte = fteSummary(lines, plantSupport, period)

  if (fte.needed == null) return null

  // Group line detail by plant for the breakdown
  const linesByPlant = new Map<string, typeof fte.lineDetail>()
  for (const d of fte.lineDetail) {
    if (!linesByPlant.has(d.plant_code)) linesByPlant.set(d.plant_code, [])
    linesByPlant.get(d.plant_code)!.push(d)
  }
  const sharedByPlant = new Map<string, typeof fte.plantSharedDetail>()
  for (const d of fte.plantSharedDetail) {
    if (!sharedByPlant.has(d.plant_code)) sharedByPlant.set(d.plant_code, [])
    sharedByPlant.get(d.plant_code)!.push(d)
  }
  const plantCodes = Array.from(new Set([...linesByPlant.keys(), ...sharedByPlant.keys()])).sort()

  // Plant subtotals
  const plantSubtotal = (plant: string) => {
    const lineFte = (linesByPlant.get(plant) ?? []).reduce((s, d) => s + d.fte, 0)
    const sharedFte = (sharedByPlant.get(plant) ?? []).reduce((s, d) => s + d.fte, 0)
    return lineFte + sharedFte
  }

  return (
    <div
      className="bg-white rounded-2xl print-avoid-break"
      style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}
    >
      <button
        onClick={() => setExpanded(s => !s)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-[#FAFAF9]"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
          <Calculator className="w-4 h-4" style={{ color: C.navy }} />
          <span className="font-semibold text-[16px]" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
            FTE breakdown by line · {monthLabel(period)}
          </span>
          <span className="font-mono text-[10.5px]" style={{ color: C.ink4 }}>
            need {fte.needed?.toFixed(1)} FTE · plan {fte.planned?.toFixed(1)} · gap {fte.gap != null && fte.gap > 0 ? `−${fte.gap.toFixed(1)}` : fte.gap != null && fte.gap < 0 ? `+${(-fte.gap).toFixed(1)}` : '0'}
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: C.ink3 }} /> : <ChevronDown className="w-4 h-4" style={{ color: C.ink3 }} />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1">
          <p className="text-[11.5px] mb-3" style={{ color: C.ink3 }}>
            How the headcount need is built up. FTE per line = (production hours × per-line crew) ÷ FTE-month hours.
            For this month: <span className="font-mono font-semibold tabnum" style={{ color: C.navy }}>1 FTE = {Math.round(fte.monthHours)}h</span>
            {' '}({fte.workingDays} working days × {Math.round(fte.monthHours / Math.max(fte.workingDays, 1))}h shift).
          </p>

          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <table className="w-full text-[12px] tabnum">
              <thead>
                <tr style={{ background: '#FAFAF9', color: C.ink3 }}>
                  <th className="text-left font-medium px-3.5 py-2">Line / Group</th>
                  <th className="text-right font-medium pr-3">Crew</th>
                  <th className="text-right font-medium pr-3">Operating hrs</th>
                  <th className="text-right font-medium pr-3">Role-hours</th>
                  <th className="text-right font-medium pr-3.5">FTE-eq.</th>
                </tr>
              </thead>
              <tbody>
                {plantCodes.map(plant => (
                  <PlantBlock
                    key={plant}
                    plant={plant}
                    lineRows={linesByPlant.get(plant) ?? []}
                    sharedRows={sharedByPlant.get(plant) ?? []}
                    subtotal={plantSubtotal(plant)}
                    isLast={plant === plantCodes[plantCodes.length - 1]}
                  />
                ))}
                <tr style={{ background: C.navyTint, borderTop: `2px solid ${C.navy}` }}>
                  <td className="px-3.5 py-2.5 font-semibold text-[13px]" style={{ color: C.navy }}>
                    Total need (site)
                  </td>
                  <td colSpan={3} />
                  <td className="text-right pr-3.5 font-bold font-mono text-[13px]" style={{ color: C.navy }}>
                    {fte.needed?.toFixed(1)} FTE
                  </td>
                </tr>
                <tr style={{ background: '#FAFAF9' }}>
                  <td className="px-3.5 py-1.5 text-[11.5px]" style={{ color: C.ink3 }}>
                    Total planned (from headcount_plan)
                  </td>
                  <td colSpan={3} />
                  <td className="text-right pr-3.5 font-mono text-[11.5px]" style={{ color: C.ink2 }}>
                    {fte.planned?.toFixed(1)} FTE
                  </td>
                </tr>
                <tr style={{ background: '#FAFAF9' }}>
                  <td className="px-3.5 py-1.5 pb-2.5 text-[11.5px] font-semibold" style={{ color: C.ink2 }}>
                    Gap
                  </td>
                  <td colSpan={3} />
                  <td className="text-right pr-3.5 pb-2.5 font-mono font-semibold text-[12px]"
                    style={{ color: fte.gap != null && fte.gap >= 1 ? C.amber : fte.gap != null && fte.gap <= -1 ? C.limeDeep : C.ink3 }}>
                    {fte.gap != null && fte.gap > 0 ? `−${fte.gap.toFixed(1)}` : fte.gap != null && fte.gap < 0 ? `+${(-fte.gap).toFixed(1)}` : '0'} FTE
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[11px] mt-3" style={{ color: C.ink4 }}>
            Line crew comes from line_resource_requirements (LINE_OPERATOR + LINE_LEADER + PALLETISING_OPERATOR per line).
            Plant-shared crew (Forklift, Materials Handler, Robot Op, Technician) is the per-plant requirement × the plant operating envelope —
            shared crew is present whenever any line in the plant is running.
          </p>
        </div>
      )}
    </div>
  )
}

function PlantBlock({
  plant, lineRows, sharedRows, subtotal, isLast,
}: {
  plant: string
  lineRows: { line_code: string; production_hours: number; crew_per_line: number; role_hours: number; fte: number }[]
  sharedRows: { role_code: string; required: number; operating_hours: number; role_hours: number; fte: number }[]
  subtotal: number
  isLast: boolean
}) {
  return (
    <>
      <tr style={{ background: '#FAFAF9' }}>
        <td colSpan={5} className="px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.navy }}>
          {plant}
        </td>
      </tr>
      {lineRows.map(d => (
        <tr key={d.line_code} style={{ borderTop: `1px solid ${C.border}` }}>
          <td className="px-3.5 py-1.5 font-semibold" style={{ color: C.navy }}>{d.line_code}</td>
          <td className="text-right pr-3" style={{ color: C.ink2 }}>{d.crew_per_line}</td>
          <td className="text-right pr-3 font-mono" style={{ color: C.ink2 }}>{fmtH(d.production_hours)}h</td>
          <td className="text-right pr-3 font-mono" style={{ color: C.ink2 }}>{fmtH(d.role_hours)}h</td>
          <td className="text-right pr-3.5 font-mono font-semibold" style={{ color: C.navy }}>{d.fte.toFixed(2)}</td>
        </tr>
      ))}
      {sharedRows.map(d => (
        <tr key={`${plant}-${d.role_code}`} style={{ borderTop: `1px solid ${C.border}`, background: '#FCFCFB' }}>
          <td className="px-3.5 py-1.5">
            <span className="text-[11px] font-mono uppercase tracking-wider mr-1.5" style={{ color: C.ink4 }}>shared</span>
            <span className="font-medium" style={{ color: C.navy }}>{d.role_code}</span>
          </td>
          <td className="text-right pr-3" style={{ color: C.ink2 }}>{d.required}</td>
          <td className="text-right pr-3 font-mono" style={{ color: C.ink2 }}>{fmtH(d.operating_hours)}h</td>
          <td className="text-right pr-3 font-mono" style={{ color: C.ink2 }}>{fmtH(d.role_hours)}h</td>
          <td className="text-right pr-3.5 font-mono font-semibold" style={{ color: C.navy }}>{d.fte.toFixed(2)}</td>
        </tr>
      ))}
      <tr style={{ borderTop: `1px solid ${C.border2}`, borderBottom: isLast ? 'none' : 'none' }}>
        <td className="px-3.5 py-1.5 text-[11px] italic" style={{ color: C.ink3 }} colSpan={4}>
          {plant} subtotal
        </td>
        <td className="text-right pr-3.5 py-1.5 font-mono font-semibold text-[11.5px]" style={{ color: C.navy }}>
          {subtotal.toFixed(2)} FTE
        </td>
      </tr>
    </>
  )
}
