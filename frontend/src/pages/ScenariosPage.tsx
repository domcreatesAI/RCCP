import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  Clock, RotateCcw, RefreshCw, AlertCircle, CheckCircle2, AlertTriangle, ArrowRight, PoundSterling,
} from 'lucide-react'
import { listBatches } from '../api/batches'
import { getDashboard } from '../api/rccp'
import { C, rollingMonths, shortMonth, shortYear, monthLabel, focusMonthPeriod, sortLinesByCode, HIDDEN_LINE_CODES, oeeBaselineLabel } from '../components/rccp/brand'
import type { Batch, RCCPLine } from '../types'

// Capacity = L/min × OEE × hours. Only OEE or hours raise it. We size to the
// firm+MRP order book and let the planner allocate extra HOURS per line to see
// how much of each line's plan that covers. OEE (55% baseline) is a fixed
// assumption shown only as an alternative.
const OEE_MAX = 85

function fmtGBP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `£${(v / 1_000).toFixed(0)}k`
  return `£${Math.round(v)}`
}

function kL(litres: number): string {
  const v = litres / 1000
  if (v >= 100) return Math.round(v).toLocaleString()
  if (v >= 10) return v.toFixed(0)
  return v.toFixed(1)
}

interface MonthRow {
  line: RCCPLine
  hasData: boolean
  util: number | null          // order book ÷ capacity (%) this month
  hclock: number               // standard clock hours this month (mins/60 × working days)
  planNeedsH: number           // run-time required to produce the order book (hclock × s)
  short: boolean
  neededH: number              // extra hours to fully meet this month
  oeeNeededPct: number | null  // OEE % that would clear it instead
  oeeFeasible: boolean
  noCapacity: boolean          // orders exist but no working days/capacity this month
  orderLitres: number          // required volume (firm + MRP order book) this month
  availLitres: number          // baseline available volume @ standard hours
}

function analyseMonth(line: RCCPLine, period: string): MonthRow {
  const oeeBase = line.oee_target || 0.55
  const mins = line.available_mins_per_day || 420
  const m = line.monthly.find(x => x.period === period)
  const order = m?.production_litres ?? 0
  const avail = m?.available_litres ?? null
  const wd = m?.working_days ?? 0
  const hclock = (mins / 60) * wd

  if (avail == null) {
    return { line, hasData: false, util: null, hclock, planNeedsH: 0, short: false, neededH: 0, oeeNeededPct: null, oeeFeasible: false, noCapacity: false, orderLitres: order, availLitres: 0 }
  }
  if (avail <= 0) {
    // No capacity this month (e.g. shutdown / no working days) — overtime can't help.
    return { line, hasData: true, util: order > 0 ? null : 0, hclock, planNeedsH: 0, short: order > 0, neededH: 0, oeeNeededPct: null, oeeFeasible: false, noCapacity: order > 0, orderLitres: order, availLitres: 0 }
  }
  const s = order / avail
  const short = order > avail
  return {
    line, hasData: true,
    util: Math.round(s * 100),
    hclock,
    planNeedsH: hclock * s,
    short,
    neededH: short ? hclock * (s - 1) : 0,
    oeeNeededPct: short ? Math.round(oeeBase * s * 100) : null,
    oeeFeasible: short && oeeBase * s * 100 <= OEE_MAX,
    noCapacity: false,
    orderLitres: order,
    availLitres: avail,
  }
}

export default function ScenariosPage() {
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [alloc, setAlloc] = useState<Record<string, number>>({})

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

  const planning = dashboard ? focusMonthPeriod(dashboard.plan_cycle_date) : null
  const months = dashboard ? rollingMonths(dashboard.plan_cycle_date, 12) : []

  // Default to the planning month once data arrives; reset allocations on month change.
  useEffect(() => { if (planning && selectedMonth === null) setSelectedMonth(planning) }, [planning, selectedMonth])
  useEffect(() => { setAlloc({}) }, [selectedMonth])

  const hasNoPublished = !isLoading && batches.length > 0 && !batches.some(b => b.status === 'PUBLISHED')
  const allLines = sortLinesByCode((dashboard?.lines ?? []).filter(l => !HIDDEN_LINE_CODES.includes(l.line_code)))

  const cogs = dashboard?.settings?.cogs_opex_per_litre ?? 0.12

  const rows = selectedMonth
    ? allLines.map(l => analyseMonth(l, selectedMonth)).sort((a, b) => (b.util ?? -1) - (a.util ?? -1))
    : []

  const shortRows = rows.filter(r => r.short)
  const monthNeeded = shortRows.reduce((s, r) => s + r.neededH, 0)
  const monthAllocated = shortRows.reduce((s, r) => s + Math.min(alloc[r.line.line_code] ?? 0, r.neededH), 0)

  // Site plan-met % for the selected month (met litres ÷ order-book litres).
  let metLitres = 0, orderLitres = 0, baseLitres = 0, gapLitres = 0
  for (const r of rows) {
    if (!selectedMonth) break
    const m = r.line.monthly.find(x => x.period === selectedMonth)
    const order = m?.production_litres ?? 0
    const avail = m?.available_litres ?? 0
    if (order <= 0) continue
    orderLitres += order
    baseLitres += Math.min(order, avail)
    gapLitres += Math.max(0, order - avail)
    const extra = Math.min(alloc[r.line.line_code] ?? 0, r.neededH)
    const newAvail = r.hclock > 0 ? avail * (1 + extra / r.hclock) : avail
    metLitres += Math.min(order, newAvail)
  }
  const siteMet = orderLitres > 0 ? Math.round((metLitres / orderLitres) * 100) : 100
  // COGS @ £/L: the cost of the extra production the hours create.
  const allocatedHoursCost = (metLitres - baseLitres) * cogs   // cost of the hours allocated so far
  const fullClearCost = gapLitres * cogs                       // cost to run all hours needed to clear the month

  const covered = shortRows.length === 0
  const verdict = covered
    ? { accent: C.lime, bg: C.limeTint, text: C.limeDeep, icon: CheckCircle2, label: 'ORDER BOOK COVERED' }
    : { accent: C.amber, bg: C.amberLight, text: C.amber, icon: AlertTriangle, label: 'EXTRA HOURS NEEDED' }
  const VIcon = verdict.icon

  function setLine(code: string, v: number) { setAlloc(a => ({ ...a, [code]: v })) }

  return (
    <div className="px-7 py-6 pb-16" style={{ color: C.ink }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="font-semibold flex items-center gap-3" style={{ color: C.navy, fontSize: 28, letterSpacing: '-0.025em', lineHeight: 1.1 }}>
          <span className="inline-block rounded" style={{ width: 5, height: 30, background: `linear-gradient(180deg,${C.lime},${C.limeDeep})`, boxShadow: '0 0 10px rgba(170,205,0,0.4)' }} />
          Scenarios — Capacity Advisor
        </h1>
        <p className="mt-2 text-[13.5px] max-w-[700px] leading-relaxed" style={{ color: C.ink2 }}>
          Capacity only rises with <strong style={{ color: C.navy, fontWeight: 600 }}>hours</strong> or OEE.
          Pick a month and allocate extra production hours per line to see how much of the firm + MRP order book each one can meet.
        </p>
      </motion.div>

      {hasNoPublished && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.amberLight, border: '1px solid #FCD34D' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.amber }} />
          <p className="text-[13px]" style={{ color: C.amber }}>Publish a batch on the Planning Data page to run scenarios.</p>
        </div>
      )}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-[13px]" style={{ color: C.ink3 }}>
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: C.navy }} /> Loading capacity data…
          </div>
        </div>
      )}
      {error && !isLoading && (
        <div className="mt-5 px-5 py-4 rounded-2xl flex items-start gap-3" style={{ background: C.redLight, border: '1px solid #FCA5A5' }}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: C.red }} />
          <p className="text-[13px]" style={{ color: C.red }}>{(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(error)}</p>
        </div>
      )}

      {dashboard && !isLoading && selectedMonth && (
        <>
          {/* Month picker + rate toggle */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl px-4 py-3 mt-6 flex items-center gap-2 flex-wrap"
            style={{ border: `1px solid ${C.border}` }}
          >
            <span className="text-[10.5px] font-semibold uppercase tracking-widest mr-1" style={{ color: C.ink3 }}>Month</span>
            {months.map(p => {
              const active = p === selectedMonth
              const isPlanning = p === planning
              return (
                <button
                  key={p}
                  onClick={() => setSelectedMonth(p)}
                  className="px-2.5 py-1 rounded-md text-[12px] font-semibold transition-all"
                  style={active
                    ? { background: C.navy, color: '#fff', border: `1px solid ${C.navy}` }
                    : { background: '#fff', color: C.ink3, border: `1px solid ${C.border}` }}
                  title={isPlanning ? 'Planning month' : undefined}
                >
                  {shortMonth(p)} {shortYear(p)}{isPlanning ? ' •' : ''}
                </button>
              )
            })}
          </motion.div>

          {/* Verdict + totals */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-2xl mt-4"
            style={{ background: '#fff', border: `1px solid ${C.border}` }}
          >
            <span className="absolute left-0 top-0 bottom-0" style={{ width: 5, background: verdict.accent }} />
            <div className="pl-6 pr-5 py-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[15px] font-bold uppercase tracking-wide"
                    style={{ background: verdict.bg, color: verdict.text, border: `1px solid ${verdict.accent}` }}>
                    <VIcon className="w-5 h-5" strokeWidth={2.4} /> {verdict.label}
                  </span>
                  <div>
                    <div className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: C.ink3 }}>{monthLabel(selectedMonth)}</div>
                    <div className="text-[14px]" style={{ color: C.ink2 }}>
                      {covered
                        ? <span style={{ color: C.limeDeep, fontWeight: 600 }}>all lines meet the order book at standard hours.</span>
                        : <><strong style={{ color: C.navy }}>{shortRows.length} line{shortRows.length > 1 ? 's' : ''}</strong> need extra hours.</>}
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="flex items-stretch gap-2.5">
                  <div className="rounded-xl px-4 py-2.5 text-right" style={{ background: C.navyTint, border: `1px solid ${C.border}` }}>
                    <div className="text-[10.5px] font-medium" style={{ color: C.ink3 }}>Extra hours · {shortMonth(selectedMonth)}</div>
                    <div className="text-[22px] font-semibold leading-none tabnum mt-1" style={{ color: C.navy }}>
                      +{Math.round(monthNeeded).toLocaleString()}<span className="text-[12px] ml-0.5" style={{ color: C.ink3 }}>h</span>
                    </div>
                  </div>
                  <div className="rounded-xl px-4 py-2.5 text-right" style={{ background: C.limeTint, border: `1px solid ${C.lime}` }}>
                    <div className="text-[10.5px] font-medium" style={{ color: C.limeDeep }}>Cost to clear · {shortMonth(selectedMonth)}</div>
                    <div className="text-[22px] font-semibold leading-none tabnum mt-1" style={{ color: C.navy }}>
                      {fmtGBP(fullClearCost)}
                    </div>
                  </div>
                </div>
              </div>

              {!covered && (
                <p className="flex items-start gap-1.5 text-[12.5px] mt-3" style={{ color: C.ink2 }}>
                  <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: verdict.accent }} strokeWidth={2.4} />
                  <span>
                    To fully meet {monthLabel(selectedMonth)}: {shortRows.map(r => `${r.line.line_code} +${Math.round(r.neededH)} h`).join(', ')}.
                    {monthAllocated > 0 && <> Allocated <strong style={{ color: C.navy }}>+{Math.round(monthAllocated).toLocaleString()} h</strong> → site plan met <strong style={{ color: siteMet >= 100 ? C.limeDeep : C.amber }}>{siteMet}%</strong> ({kL(metLitres)} / {kL(orderLitres)} kL).</>}
                  </span>
                </p>
              )}

              {gapLitres > 0 && (
                <p className="flex items-start gap-1.5 text-[12.5px] mt-2" style={{ color: C.ink2 }}>
                  <PoundSterling className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: C.ink3 }} strokeWidth={2.2} />
                  <span>
                    Running the hours to fully clear {monthLabel(selectedMonth)} would cost ≈ <strong style={{ color: C.navy }}>{fmtGBP(fullClearCost)}</strong> (extra production × £{cogs.toFixed(2)}/L)
                    {allocatedHoursCost > 0 && <> · your allocated hours so far ≈ <strong style={{ color: C.navy }}>{fmtGBP(allocatedHoursCost)}</strong></>}.
                  </span>
                </p>
              )}
            </div>
          </motion.div>

          {/* Per-line allocator */}
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl px-5 py-5 mt-4"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
                  <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
                  Allocate extra hours — {monthLabel(selectedMonth)}
                </h2>
                <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
                  Drag each short line to the hours you can give it; "plan met" shows how much of its order book that covers.
                </p>
              </div>
              {monthAllocated > 0 && (
                <button onClick={() => setAlloc({})} className="inline-flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md transition-colors hover:bg-[#F7F7F5]" style={{ color: C.ink3 }}>
                  <RotateCcw className="w-3 h-3" /> Clear allocations
                </button>
              )}
            </div>

            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Line', 'Load', 'Extra needed', 'Allocate hours', 'Cost (£)', 'Plan met', 'or OEE'].map((h, i) => (
                    <th key={h} className="text-[11px] font-semibold uppercase tracking-wider pb-2.5 pr-4"
                      style={{ color: C.ink3, textAlign: i === 0 || i === 3 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const code = r.line.line_code
                  const loadColor = r.util == null ? C.ink4 : r.util >= 100 ? C.red : r.util >= 90 ? C.amber : C.limeDeep
                  const allocated = Math.min(alloc[code] ?? 0, r.neededH)
                  const met = r.noCapacity ? 0
                    : !r.short ? 100
                    : Math.min(100, Math.round(((r.hclock + allocated) / r.planNeedsH) * 100))
                  const metColor = met >= 100 ? C.limeDeep : met >= 75 ? '#A16207' : C.amber
                  const producedL = r.orderLitres <= 0 ? 0
                    : Math.min(r.orderLitres, r.availLitres * (r.hclock > 0 ? (1 + allocated / r.hclock) : 1))
                  const lineCost = r.short && r.hclock > 0 ? (allocated / r.hclock) * r.availLitres * cogs : 0
                  const crewParts = r.line.hc_roles.map(rr => `${rr.required} × ${rr.role_code}`).join(' · ')
                  const allocCrew = allocated > 0
                    ? r.line.hc_roles.map(rr => `${rr.required} × ${Math.round(allocated)}h ${rr.role_code}`).join(' · ')
                    : null
                  return (
                    <tr key={code} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-3 pr-4">
                        <span className="font-semibold" style={{ color: C.navy }}>{code}</span>
                        <span className="text-[11px] ml-2" style={{ color: C.ink4 }}>{r.line.plant_code}</span>
                        {crewParts && (
                          <div className="text-[10.5px] font-mono mt-0.5" style={{ color: C.ink4 }}>{crewParts}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold text-[12.5px] tabnum" style={{ color: loadColor }}>
                        {r.util != null ? `${r.util}%` : r.noCapacity ? 'no cap.' : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabnum" style={{ color: r.short ? C.navy : C.ink4 }}
                        title={r.short ? `${Math.round(r.planNeedsH)} h needed vs ${Math.round(r.hclock)} h standard` : undefined}>
                        {r.short ? (r.noCapacity ? 'no working days' : `+${Math.round(r.neededH).toLocaleString()} h`) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {r.short && !r.noCapacity ? (
                          <>
                            <div className="flex items-center gap-2">
                              <input type="range" min={0} max={Math.ceil(r.neededH)} step={1}
                                value={allocated}
                                onChange={e => setLine(code, Number(e.target.value))}
                                className="w-[150px]" style={{ accentColor: C.navy }} />
                              <span className="font-mono text-[12px] tabnum w-[52px]" style={{ color: C.ink2 }}>+{Math.round(allocated)} h</span>
                            </div>
                            {allocCrew && (
                              <div className="text-[10.5px] font-mono mt-1" style={{ color: C.limeDeep }}>Crew: {allocCrew}</div>
                            )}
                          </>
                        ) : (
                          <span className="text-[12px]" style={{ color: C.ink4 }}>—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-[12.5px] tabnum" style={{ color: r.short ? C.navy : C.ink4 }}>
                        {r.short && !r.noCapacity ? fmtGBP(lineCost) : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <div className="font-mono font-semibold text-[12.5px] tabnum" style={{ color: r.hasData ? metColor : C.ink4 }}>
                          {r.hasData ? `${met}%` : '—'}
                        </div>
                        {r.orderLitres > 0 && (
                          <div className="font-mono text-[10.5px] tabnum mt-0.5" style={{ color: C.ink4 }}>
                            {kL(producedL)} / {kL(r.orderLitres)} kL
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono text-[12px] tabnum" style={{ color: r.short ? (r.oeeFeasible ? C.ink3 : C.red) : C.ink4 }}>
                        {r.short && r.oeeNeededPct != null ? (r.oeeFeasible ? `→ ${r.oeeNeededPct}%` : `→ ${OEE_MAX}%+`) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <p className="text-[11.5px] mt-3 flex items-center gap-1.5 flex-wrap" style={{ color: C.ink4 }}>
              <Clock className="w-3 h-3" />
              <span>
                "Extra needed" = total production hours to fully meet that line's order book this month (at {oeeBaselineLabel(allLines)} OEE).
                Cost = extra litres × £{cogs.toFixed(2)}/L.
                Crew = the per-line headcount requirement × the hours allocated — tell Manufacturing what they need to staff for.
              </span>
            </p>
          </motion.div>
        </>
      )}
    </div>
  )
}
