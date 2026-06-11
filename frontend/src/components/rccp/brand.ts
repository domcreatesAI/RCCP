// Shared Moove brand tokens + risk helpers for the RCCP views.
// Single source of truth so the Executive Summary and planner dashboard
// (NextMonthSpotlight, LineRiskRadar, CapacityChart) stay visually in sync.

import type { RCCPLine, RCCPPlantSupportRole } from '../../types'

// ─── Moove palette ──────────────────────────────────────────────────────────────
export const C = {
  navy: '#0C3C5D', navy2: '#143F5C', navyDeep: '#082A40',
  navyTint: '#E8EEF3', navyTint2: '#D6E0E9',
  lime: '#AACD00', limeDeep: '#7B9400', limeTint: '#F0F7CC', limeBright: '#BFDD20',
  sage: '#B1CCBB', sageTint: '#EDF4EF',
  ink: '#0F1A24', ink2: '#3F4D5B', ink3: '#6B7A8A', ink4: '#9CABB9',
  border: '#E2E6EA', border2: '#CCD3DA', bg: '#F7F7F5',
  red: '#C2410C', redLight: '#FEE4D5',
  amber: '#B45309', amberLight: '#FEF3C7',
  green: '#166534', greenLight: '#DCFCE7',
} as const

export const LINE_ORDER = [
  'A101', 'A102', 'A103', 'A201', 'A202', 'A302', 'A303',
  'A304', 'A305', 'A307', 'A308', 'A401', 'A501', 'A502',
]

// Lines hidden from the dashboards for now (no confirmed pack capabilities yet).
// Kept in the engine/DB so they can be switched back on by removing them here.
export const HIDDEN_LINE_CODES = ['A501', 'A502']

export type RiskStatus = 'Critical' | 'High' | 'Watch' | 'Stable' | 'No data'

// Risk-status → tone. Matches the Executive Summary `RISK` map.
export const RISK_TONE: Record<RiskStatus, { bg: string; text: string; dot: string }> = {
  Critical:  { bg: C.redLight,   text: C.red,      dot: C.red },
  High:      { bg: C.amberLight, text: C.amber,    dot: C.amber },
  Watch:     { bg: '#FEF9C3',    text: '#A16207',  dot: '#FACC15' },
  Stable:    { bg: C.limeTint,   text: C.limeDeep, dot: C.lime },
  'No data': { bg: '#F4F4F5',    text: C.ink3,     dot: C.ink4 },
}

export const RISK_RANK: Record<RiskStatus, number> = {
  Critical: 4, High: 3, Watch: 2, Stable: 1, 'No data': 0,
}

// Materiality threshold for headcount shortfall in the SUMMARY views (spotlight + radar).
// The engine flags labour_status='SHORTFALL' on any positive gap, including sub-1-FTE
// monthly averages that are within rostering noise. At the exec/summary level we only
// surface whole-person gaps so the headline stays actionable. The detailed LineRiskTable
// remains engine-faithful and shows every fractional shortfall.
export const HC_MATERIAL = 1.0

// ─── Utilisation heat scale (Moove-toned, green→lime→amber→red) ──────────────────
// Returns a fill + a readable foreground for that fill.
export function utilTone(util: number | null): { bg: string; fg: string } {
  if (util === null)   return { bg: '#EEF0F2', fg: C.ink4 }   // no data
  if (util >= 115)     return { bg: '#C2410C', fg: '#FFFFFF' } // critical
  if (util >= 100)     return { bg: '#E2670C', fg: '#FFFFFF' } // overloaded
  if (util >= 90)      return { bg: '#EA9A2E', fg: '#3F2A07' } // near limit
  if (util >= 75)      return { bg: '#F2C94C', fg: '#4A3608' } // watch
  if (util >= 50)      return { bg: C.lime,    fg: '#34400A' } // healthy
  return                      { bg: '#DCEBC2', fg: '#52663A' } // idle (<50%)
}

// ─── Period helpers ──────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function addMonths(yyyyMM: string, n: number): string {
  let [y, m] = yyyyMM.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1)  { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

export function shortMonth(period: string): string {
  return MONTHS_SHORT[parseInt(period.split('-')[1]) - 1]
}

export function shortYear(period: string): string {
  return `'${period.slice(2, 4)}`
}

export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** 'YYYY-MM' of the plan-cycle month. */
export function cyclePeriod(planCycleDate: string): string {
  return planCycleDate.slice(0, 7)
}

/** n consecutive periods starting at the plan-cycle month (inclusive). */
export function rollingMonths(planCycleDate: string, n = 12): string[] {
  const start = cyclePeriod(planCycleDate)
  return Array.from({ length: n }, (_, i) => addMonths(start, i))
}

/**
 * Months from the plan-cycle month to the spotlight's focus month.
 * 0 = focus the plan-cycle month itself (current testing data is for May, and the
 * cycle date tracks the month being planned). Set to 1 only if a deployment's cycle
 * date tracks the current month rather than the month being planned.
 */
export const FOCUS_MONTH_OFFSET = 0

/** The month the planner is focused on (see FOCUS_MONTH_OFFSET). */
export function focusMonthPeriod(planCycleDate: string): string {
  return addMonths(cyclePeriod(planCycleDate), FOCUS_MONTH_OFFSET)
}

/** Site OEE headline derived from the per-line OEE: a single % when uniform, else a range. */
export function oeeBaselineLabel(lines: RCCPLine[]): string {
  const vals = [...new Set(lines.map(l => Math.round((l.oee_target ?? 0.55) * 100)))].sort((a, b) => a - b)
  if (vals.length === 0) return '—'
  if (vals.length === 1) return `${vals[0]}%`
  return `${vals[0]}–${vals[vals.length - 1]}%`
}

export function sortLinesByCode<T extends { line_code: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const ai = LINE_ORDER.indexOf(a.line_code)
    const bi = LINE_ORDER.indexOf(b.line_code)
    if (ai === -1 && bi === -1) return a.line_code.localeCompare(b.line_code)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

// ─── Risk computations ───────────────────────────────────────────────────────────
export type Verdict = 'ON TRACK' | 'AT RISK' | 'CRITICAL'

export interface FocusVerdict {
  verdict: Verdict
  // Plan feasibility: % of production deliverable at current per-line capacity.
  // 100% = the plan fits. < 100% = some demand can't be made on the lines as-is.
  planFeasibility: number | null
  deliverableLitres: number            // Σ min(prod_i, avail_i)
  shortfallLitres: number              // Σ max(0, prod_i − avail_i)  — the unbookable volume
  productionTotal: number              // Σ (firm + planned)  — the committed plan
  firmTotal: number                    // Σ firm_litres (YPAC)
  plannedTotal: number                 // Σ planned_litres (LA / MRP)
  // Theoretical capacity load — Σ prod / Σ avail — kept for the optimisation sub-line.
  siteUtilTheoretical: number | null
  theoreticalCapacity: number | null
  // Demand vs capacity (theoretical, unchanged).
  demandCov: number | null
  demandTotal: number
  over: { code: string; util: number }[]
  short: { code: string; shortfall: number }[]
}

/**
 * Plan-feasibility verdict for a single focus month.
 *
 * The headline metric is **plan feasibility** — the share of planned production
 * that fits in current per-line capacity. Anything under 100% means some demand
 * can't be made and needs OT, an extra shift, or a reschedule.
 *
 *   deliverable   = Σ min(production_i, available_i)
 *   shortfall     = Σ max(0, production_i − available_i)
 *   feasibility   = deliverable / Σ production
 *
 * The theoretical figure (Σ prod / Σ avail) is kept as a secondary number —
 * "if mix could rebalance freely across lines".
 */
export function focusVerdict(lines: RCCPLine[], period: string): FocusVerdict {
  let availSum = 0, prod = 0, demand = 0, firm = 0, plannedSum = 0
  let deliverable = 0, shortfall = 0
  let anyAvail = false
  const over: { code: string; util: number }[] = []
  const short: { code: string; shortfall: number }[] = []

  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    const a = m.available_litres ?? 0
    const p = m.production_litres ?? 0
    const d = m.demand_litres ?? 0
    if (m.available_litres != null) { anyAvail = true; availSum += a }
    prod += p
    firm += m.firm_litres ?? 0
    plannedSum += m.planned_litres ?? 0
    demand += d
    if (m.available_litres != null && p > 0) {
      deliverable += Math.min(p, a)
      shortfall   += Math.max(0, p - a)
    } else {
      // No capacity data → treat production as deliverable (no constraint signal).
      deliverable += p
    }
    if (m.utilisation_pct != null && m.utilisation_pct >= 100) {
      over.push({ code: l.line_code, util: m.utilisation_pct })
    }
    if (m.labour_status === 'SHORTFALL' && (m.hc_shortfall ?? 0) >= HC_MATERIAL) {
      short.push({ code: l.line_code, shortfall: m.hc_shortfall ?? 0 })
    }
  }

  const planFeasibility = prod > 0 ? Math.round((deliverable / prod) * 100) : null
  const siteUtilTheoretical =
    anyAvail && availSum > 0 ? Math.round((prod / availSum) * 100) : null
  const demandCov =
    anyAvail && availSum > 0 ? Math.round((demand / availSum) * 100) : null

  let verdict: Verdict
  if (over.length > 0) verdict = 'CRITICAL'
  else if (short.length > 0 || (demandCov != null && demandCov > 100)) verdict = 'AT RISK'
  else verdict = 'ON TRACK'

  over.sort((a, b) => b.util - a.util)
  short.sort((a, b) => b.shortfall - a.shortfall)
  return {
    verdict,
    planFeasibility,
    deliverableLitres: deliverable,
    shortfallLitres: shortfall,
    productionTotal: prod,
    firmTotal: firm,
    plannedTotal: plannedSum,
    siteUtilTheoretical,
    theoreticalCapacity: anyAvail ? availSum : null,
    demandCov,
    demandTotal: demand,
    over,
    short,
  }
}

export interface LineHeadline {
  peakUtil: number | null
  peakPeriod: string | null
  worstShort: number          // largest single-month shortfall (0 if none)
  shortPeriod: string | null
  demandCov: number | null
}

/** Peak utilisation + worst staffing gap for a line across a set of periods. */
export function lineHeadline(line: RCCPLine, periods: string[]): LineHeadline {
  let peakUtil: number | null = null, peakPeriod: string | null = null
  let worstShort = 0, shortPeriod: string | null = null
  let totalAvail = 0, totalDemand = 0
  const set = new Set(periods)

  for (const m of line.monthly) {
    if (!set.has(m.period)) continue
    if (m.utilisation_pct != null && (peakUtil === null || m.utilisation_pct > peakUtil)) {
      peakUtil = m.utilisation_pct
      peakPeriod = m.period
    }
    if (m.labour_status === 'SHORTFALL' && m.hc_shortfall != null && m.hc_shortfall >= HC_MATERIAL && m.hc_shortfall > worstShort) {
      worstShort = m.hc_shortfall
      shortPeriod = m.period
    }
    totalAvail  += m.available_litres ?? 0
    totalDemand += m.demand_litres ?? 0
  }

  const demandCov = totalAvail > 0 ? Math.round((totalDemand / totalAvail) * 100) : null
  return { peakUtil, peakPeriod, worstShort, shortPeriod, demandCov }
}

/**
 * Coherent risk classification for the summary radar, from peak utilisation and a
 * *material* labour gap. Unlike the engine's risk_status (which escalates any
 * sub-1-FTE shortfall straight to Critical), this keeps the traffic-light readable:
 * a whole-person staffing gap lands at High, capacity over 100% at Critical.
 */
export function displayStatus(peakUtil: number | null, materialShort: number): RiskStatus {
  if (peakUtil === null) return materialShort >= HC_MATERIAL ? 'High' : 'No data'
  if (peakUtil > 100) return 'Critical'
  if (peakUtil > 90 || materialShort >= HC_MATERIAL) return 'High'
  if (peakUtil > 75) return 'Watch'
  return 'Stable'
}

// ─── FTE-equivalent headcount summary ───────────────────────────────────────────
//
// FTE = full-time equivalent. 1 FTE = one person working a standard month
// (e.g. 22 working days × 7h = 154h). Headcount expressed in FTE captures
// part-time, overtime, and partial-month-running scenarios that head-counts
// alone hide.
//
// FTE_month_hours is calendar-derived so February (~19 wd) gives a smaller
// "1 FTE" envelope than July (~23 wd).
//
//   site_working_days = max(working_days across all visible lines that month)
//   shift_hours       = max(available_mins_per_day) / 60
//   FTE_month_hours   = site_working_days × shift_hours
//
//   role_hours_line   = production_hours × Σ hc_roles[r].required (per line)
//   role_hours_plant  = plant_req[role] × plant_operating_hours    (per plant role)
//   needed_FTE        = (Σ role_hours_line + Σ role_hours_plant) / FTE_month_hours
//
//   planned_FTE       = Σ hc_planned_avg across line + plant role entries

// Per-line FTE detail used by the breakdown panel — shows the build-up:
// (production hours × per-line crew) ÷ FTE_month_hours
export interface FteLineDetail {
  line_code: string
  plant_code: string
  production_hours: number
  crew_per_line: number              // sum of hc_roles required
  role_hours: number                 // production_hours × crew_per_line
  fte: number                        // role_hours / FTE_month_hours
}

export interface FtePlantSharedDetail {
  plant_code: string
  role_code: string
  required: number
  operating_hours: number             // plant operating envelope this month
  role_hours: number                  // required × operating_hours
  fte: number                         // role_hours / FTE_month_hours
}

export interface FteSummary {
  needed: number | null              // FTE-equivalents required to run the plan
  planned: number | null             // FTE-equivalents available from headcount_plan
  gap: number | null                 // needed − planned  (+ve = short)
  monthHours: number                 // 1-FTE envelope this month (hours)
  workingDays: number                // site working days this month
  lineDetail: FteLineDetail[]
  plantSharedDetail: FtePlantSharedDetail[]
}

export function fteSummary(
  lines: RCCPLine[],
  plantSupport: Record<string, RCCPPlantSupportRole[]>,
  period: string,
): FteSummary {
  // Site working days = max across visible lines (handles single-line maintenance gracefully)
  let siteWd = 0
  let shiftMins = 0
  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    if (m.working_days > siteWd) siteWd = m.working_days
    const mins = l.available_mins_per_day || 420
    if (mins > shiftMins) shiftMins = mins
  }
  const monthHours = (siteWd * shiftMins) / 60

  if (monthHours === 0) {
    return { needed: null, planned: null, gap: null, monthHours: 0, workingDays: 0, lineDetail: [], plantSharedDetail: [] }
  }

  // Plant operating envelope (max line-hours per plant) — for plant-shared role hours
  const plantOperatingHours = new Map<string, number>()
  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    const ah = m.available_hours ?? 0
    const cur = plantOperatingHours.get(l.plant_code) ?? 0
    if (ah > cur) plantOperatingHours.set(l.plant_code, ah)
  }

  let totalRoleHours = 0
  let totalPlanned = 0
  const lineDetail: FteLineDetail[] = []
  const plantSharedDetail: FtePlantSharedDetail[] = []

  // Line roles — only count role-hours when the line is actually scheduled (production_hours > 0)
  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    const productionHours = m.production_hours ?? 0
    const lineCrew = l.hc_roles.reduce((s, r) => s + r.required, 0)
    if (productionHours > 0) {
      const roleHours = productionHours * lineCrew
      totalRoleHours += roleHours
      lineDetail.push({
        line_code: l.line_code,
        plant_code: l.plant_code,
        production_hours: Math.round(productionHours * 10) / 10,
        crew_per_line: lineCrew,
        role_hours: Math.round(roleHours * 10) / 10,
        fte: Math.round((roleHours / monthHours) * 100) / 100,
      })
    }
    if (m.hc_planned_avg != null) totalPlanned += m.hc_planned_avg
  }

  // Plant-shared roles — present whenever the plant operates
  for (const [plantCode, roles] of Object.entries(plantSupport)) {
    const opHours = plantOperatingHours.get(plantCode) ?? 0
    for (const role of roles) {
      if (opHours > 0) {
        const roleHours = role.required * opHours
        totalRoleHours += roleHours
        plantSharedDetail.push({
          plant_code: plantCode,
          role_code: role.role_code,
          required: role.required,
          operating_hours: Math.round(opHours * 10) / 10,
          role_hours: Math.round(roleHours * 10) / 10,
          fte: Math.round((roleHours / monthHours) * 100) / 100,
        })
      }
      const monthly = role.monthly?.find(x => x.period === period)
      if (monthly?.hc_planned_avg != null) totalPlanned += monthly.hc_planned_avg
    }
  }

  const needed = totalRoleHours / monthHours
  return {
    needed: Math.round(needed * 10) / 10,
    planned: Math.round(totalPlanned * 10) / 10,
    gap: Math.round((needed - totalPlanned) * 10) / 10,
    monthHours: Math.round(monthHours * 10) / 10,
    workingDays: siteWd,
    lineDetail: lineDetail.sort((a, b) => b.fte - a.fte),
    plantSharedDetail,
  }
}

// Aggregate FTE summary across multiple periods (e.g. 12-month horizon).
// Returns average per-month figures so the 12-month tile reads in the same
// units as the planning-month tile (no apples vs oranges).
export interface FteHorizonSummary {
  avgNeeded: number | null
  avgPlanned: number | null
  avgGap: number | null
  monthsShort: number          // count of horizon months with material gap (≥ 1 FTE)
  totalMonths: number
}

export function fteSummaryHorizon(
  lines: RCCPLine[],
  plantSupport: Record<string, RCCPPlantSupportRole[]>,
  periods: string[],
): FteHorizonSummary {
  let needSum = 0, planSum = 0, gapSum = 0
  let count = 0, monthsShort = 0
  for (const p of periods) {
    const fte = fteSummary(lines, plantSupport, p)
    if (fte.needed == null) continue
    needSum += fte.needed
    planSum += fte.planned ?? 0
    gapSum  += fte.gap ?? 0
    if ((fte.gap ?? 0) >= 1) monthsShort++
    count++
  }
  if (count === 0) {
    return { avgNeeded: null, avgPlanned: null, avgGap: null, monthsShort: 0, totalMonths: periods.length }
  }
  return {
    avgNeeded: Math.round((needSum / count) * 10) / 10,
    avgPlanned: Math.round((planSum / count) * 10) / 10,
    avgGap: Math.round((gapSum / count) * 10) / 10,
    monthsShort,
    totalMonths: count,
  }
}
