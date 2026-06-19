import { Wrench, CheckCircle2 } from 'lucide-react'
import type { RCCPLine } from '../../types'
import { C, rollingMonths, shortMonth, shortYear, monthLabel, sortLinesByCode, HIDDEN_LINE_CODES } from './brand'

// Per-line × 12-month grid of planned downtime hours. Cells show the total of
// maintenance + planned_downtime + public_holiday + other_loss for that line ×
// month. Cells with 0 stay blank. When the whole grid is zero we collapse to a
// single green "no losses planned" card so the panel doesn't add visual noise.

interface Props {
  lines: RCCPLine[]
  planCycleDate: string
}

function fmtH(h: number): string {
  if (h >= 100) return Math.round(h).toString()
  if (h >= 10)  return h.toFixed(0)
  return h.toFixed(1).replace(/\.0$/, '')
}

function intensityBg(h: number, peak: number): string {
  if (h <= 0 || peak <= 0) return 'transparent'
  // Amber tint scaled to the peak loss in the grid
  const t = Math.min(1, h / peak)
  const alpha = 0.18 + 0.55 * t
  return `rgba(180, 83, 9, ${alpha.toFixed(2)})`
}

function tooltipFor(line: RCCPLine, period: string): string {
  const m = line.monthly.find(x => x.period === period)
  const bd = m?.loss_breakdown
  if (!bd) return ''
  return Object.entries(bd)
    .filter(([, h]) => h > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, h]) => `${reason} ${fmtH(h)}h`)
    .join(' · ')
}

export default function DowntimePanel({ lines, planCycleDate }: Props) {
  const months = rollingMonths(planCycleDate, 12)
  const visibleLines = sortLinesByCode(lines.filter(l => !HIDDEN_LINE_CODES.includes(l.line_code)))

  // Build the grid: rows = lines, cols = months. Only render rows with any loss.
  const grid = visibleLines.map(l => {
    const cells = months.map(p => {
      const m = l.monthly.find(x => x.period === p)
      return Math.round((m?.loss_hours ?? 0) * 10) / 10
    })
    return { line: l, cells, total: cells.reduce((s, v) => s + v, 0) }
  })

  const grandTotal = grid.reduce((s, r) => s + r.total, 0)
  const peak = Math.max(0, ...grid.flatMap(r => r.cells))
  const monthTotals = months.map((_p, idx) => grid.reduce((s, r) => s + r.cells[idx], 0))
  const rowsWithLoss = grid.filter(r => r.total > 0)

  return (
    <div
      className="bg-white rounded-2xl px-5 py-5 print-avoid-break"
      style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}
    >
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <h2
            className="text-[16px] font-semibold flex items-center gap-2.5"
            style={{ color: C.navy, letterSpacing: '-0.018em' }}
          >
            <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
            Planned downtime — next 12 months
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            Downtime hours recorded in the line capacity calendar — by reason. Downtime reduces available capacity.
          </p>
        </div>
        {grandTotal > 0 && (
          <div
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md"
            style={{ background: C.amberLight, color: C.amber, border: `1px solid ${C.amber}33` }}
          >
            <Wrench className="w-3.5 h-3.5" strokeWidth={2.2} />
            {fmtH(grandTotal)}h scheduled
          </div>
        )}
      </div>

      {grandTotal === 0 ? (
        <div
          className="flex items-center gap-3 px-4 py-4 rounded-xl"
          style={{ background: C.limeTint, border: `1px solid ${C.lime}55` }}
        >
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: C.limeDeep }} strokeWidth={2.2} />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: C.limeDeep }}>
              No availability losses planned
            </p>
            <p className="text-[11.5px] mt-0.5" style={{ color: C.ink2 }}>
              No maintenance, downtime or other losses recorded for any line in the next 12 months. Confirm with Manufacturing before the meeting.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabnum">
            <thead>
              <tr>
                <th
                  className="text-left font-medium py-1.5 pr-3 sticky left-0 bg-white"
                  style={{ color: C.ink3, borderBottom: `1px solid ${C.border}` }}
                >
                  Line
                </th>
                {months.map(p => (
                  <th
                    key={p}
                    className="text-center font-medium px-1.5 py-1.5"
                    style={{ color: C.ink3, borderBottom: `1px solid ${C.border}`, minWidth: 38 }}
                  >
                    <div>{shortMonth(p)}</div>
                    <div className="text-[9.5px]" style={{ color: C.ink4 }}>{shortYear(p)}</div>
                  </th>
                ))}
                <th
                  className="text-right font-medium pl-2 py-1.5"
                  style={{ color: C.ink3, borderBottom: `1px solid ${C.border}` }}
                >
                  Σ
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsWithLoss.map(r => (
                <tr key={r.line.line_code}>
                  <td
                    className="py-1.5 pr-3 sticky left-0 bg-white"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <span className="font-semibold" style={{ color: C.navy }}>{r.line.line_code}</span>
                    <span className="ml-1.5 text-[10px]" style={{ color: C.ink4 }}>{r.line.plant_code}</span>
                  </td>
                  {r.cells.map((h, idx) => (
                    <td
                      key={months[idx]}
                      className="text-center px-1.5 py-1.5 font-mono"
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        background: intensityBg(h, peak),
                        color: h > 0 ? '#3F2A07' : C.ink4,
                        fontWeight: h > 0 ? 600 : 400,
                      }}
                      title={h > 0 ? `${r.line.line_code} · ${monthLabel(months[idx])} — ${tooltipFor(r.line, months[idx])}` : ''}
                    >
                      {h > 0 ? `${fmtH(h)}h` : ''}
                    </td>
                  ))}
                  <td
                    className="text-right pl-2 py-1.5 font-mono font-semibold"
                    style={{ borderBottom: `1px solid ${C.border}`, color: C.navy }}
                  >
                    {fmtH(r.total)}h
                  </td>
                </tr>
              ))}
              <tr>
                <td
                  className="py-1.5 pr-3 sticky left-0 bg-white text-[10.5px] uppercase tracking-wider font-semibold"
                  style={{ color: C.ink3 }}
                >
                  Total
                </td>
                {monthTotals.map((h, idx) => (
                  <td
                    key={`tot-${idx}`}
                    className="text-center px-1.5 py-1.5 font-mono font-semibold"
                    style={{ color: h > 0 ? C.navy : C.ink4 }}
                  >
                    {h > 0 ? `${fmtH(h)}h` : ''}
                  </td>
                ))}
                <td className="text-right pl-2 py-1.5 font-mono font-bold" style={{ color: C.navy }}>
                  {fmtH(grandTotal)}h
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] mt-3 ml-[1px]" style={{ color: C.ink4 }}>
        Source: line_capacity_calendar downtime_hours (subtracted from each line's shift). Hover a cell for the reason breakdown.
      </p>
    </div>
  )
}
