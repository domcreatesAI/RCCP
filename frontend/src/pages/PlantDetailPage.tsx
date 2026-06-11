import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertCircle, RefreshCw, Settings2, Users } from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard } from '../api/rccp'
import type { Batch } from '../types'
import { C, sortLinesByCode, HIDDEN_LINE_CODES, monthLabel, fteSummary, focusMonthPeriod } from '../components/rccp/brand'
import PeopleFitPanel from '../components/rccp/PeopleFitPanel'
import DowntimePanel from '../components/rccp/DowntimePanel'
import FteBreakdownPanel from '../components/rccp/FteBreakdownPanel'

// Tactical detail page — the screens the planner uses to drill into people
// and downtime. Kept off the Executive Summary so the share-with-leadership
// view stays clean.

export default function PlantDetailPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const { data: batches = [] } = useQuery({ queryKey: ['batches'], queryFn: listBatches })

  useEffect(() => {
    if (batches.length > 0 && selectedBatchId === null) {
      const pub = batches.find((b: Batch) => b.status === 'PUBLISHED')
      if (pub) setSelectedBatchId(pub.batch_id)
    }
  }, [batches, selectedBatchId])

  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['rccp-dashboard', selectedBatchId],
    queryFn: () => getDashboard(selectedBatchId!),
    enabled: selectedBatchId !== null,
    staleTime: 5 * 60 * 1000,
  })

  const allLines = sortLinesByCode(
    (dashboard?.lines ?? []).filter(l => !HIDDEN_LINE_CODES.includes(l.line_code)),
  )

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some(b => b.status === 'PUBLISHED')

  return (
    <div className="px-7 py-6 pb-16" style={{ color: C.ink }}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-semibold flex items-center gap-3 flex-wrap" style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          <span className="inline-block rounded" style={{ width: 5, height: 30, background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`, boxShadow: '0 0 10px rgba(170,205,0,0.4)' }} />
          Plant Detail
          <span
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
            style={{ background: C.navyTint, color: C.navy, border: `1px solid ${C.border}`, letterSpacing: '0.18em' }}
          >
            <Settings2 className="w-2.5 h-2.5" /> tactical
          </span>
        </h1>
        <p className="mt-2 text-[13.5px] max-w-[760px] leading-relaxed" style={{ color: C.ink2 }}>
          People-fit and planned-downtime detail for the planning conversation. Lives outside the Executive Summary so the share-with-leadership view stays clean.
        </p>
      </motion.div>

      {hasNoPublished && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.amberLight, border: '1px solid #FCD34D' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.amber }} />
          <p className="text-[13px]" style={{ color: C.amber }}>Publish a batch on the Planning Data page to populate this view.</p>
        </div>
      )}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} /> Loading…
          </div>
        </div>
      )}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>{(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(error)}</p>
        </div>
      )}

      {dashboard && !isLoading && (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }} className="mt-5">
            <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: C.ink3 }}>
              Plan cycle · {monthLabel(dashboard.plan_cycle_date.slice(0, 7))}
            </span>
          </motion.div>

          {/* Headcount summary — mirrors the exec spotlight tile, sits above the panel */}
          {(() => {
            const focus = focusMonthPeriod(dashboard.plan_cycle_date)
            const fte = fteSummary(allLines, dashboard.plant_support_requirements ?? {}, focus)
            if (fte.needed == null) return null
            const gap = fte.gap ?? 0
            const tone = gap >= 1 ? C.amber : gap <= -1 ? C.limeDeep : C.navy
            return (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                className="mt-3 rounded-2xl bg-white px-5 py-4 flex items-start justify-between gap-4 flex-wrap"
                style={{ border: `1px solid ${C.border}` }}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center rounded-md" style={{ width: 30, height: 30, background: C.navyTint, color: C.navy }}>
                    <Users className="w-4 h-4" strokeWidth={2.2} />
                  </span>
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>
                      Headcount · {monthLabel(focus)}
                    </div>
                    <div className="text-[13px]" style={{ color: C.ink2 }}>
                      {gap >= 1
                        ? <>The plan needs <strong style={{ color: tone }}>{fte.gap?.toFixed(1)} more FTE</strong> than currently planned.</>
                        : gap <= -1
                          ? <>You have <strong style={{ color: tone }}>{(-gap).toFixed(1)} FTE surplus</strong> for this month.</>
                          : <>Headcount and plan are <strong style={{ color: tone }}>matched</strong>.</>}
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline gap-5 font-mono tabnum text-[12.5px]" style={{ color: C.ink2 }}>
                  <span>Need <strong style={{ color: C.navy }}>{fte.needed?.toFixed(1)}</strong> FTE</span>
                  <span>Planned <strong style={{ color: C.navy }}>{fte.planned?.toFixed(1)}</strong> FTE</span>
                  <span>
                    Gap{' '}
                    <strong style={{ color: tone }}>
                      {gap > 0 ? `−${gap.toFixed(1)}` : gap < 0 ? `+${(-gap).toFixed(1)}` : '0'}
                    </strong>
                  </span>
                  <span className="text-[10.5px]" style={{ color: C.ink4 }}>
                    1 FTE = {Math.round(fte.monthHours)}h ({fte.workingDays} wd)
                  </span>
                </div>
              </motion.div>
            )
          })()}

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="mt-4">
            <FteBreakdownPanel
              lines={allLines}
              plantSupport={dashboard.plant_support_requirements ?? {}}
              planCycleDate={dashboard.plan_cycle_date}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-4">
            <PeopleFitPanel
              lines={allLines}
              plantSupport={dashboard.plant_support_requirements ?? {}}
              planCycleDate={dashboard.plan_cycle_date}
            />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }} className="mt-4">
            <DowntimePanel lines={allLines} planCycleDate={dashboard.plan_cycle_date} />
          </motion.div>

          <p className="mt-8 pt-5 text-[11.5px] text-center flex items-center justify-center gap-3 flex-wrap" style={{ borderTop: `1px solid ${C.border}`, color: C.ink3 }}>
            <span className="font-bold tracking-tight" style={{ color: C.navy }}>moove</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>RCCP One · Plant Detail</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Gravesend UKP1</span>
            <span style={{ color: C.ink4 }}>·</span>
            <span>Plan cycle {monthLabel(dashboard.plan_cycle_date.slice(0, 7))}</span>
          </p>
        </>
      )}
    </div>
  )
}
