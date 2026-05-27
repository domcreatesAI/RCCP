// Shared Moove brand tokens + risk helpers for the RCCP views.
// Single source of truth so the Executive Summary and planner dashboard
// (NextMonthSpotlight, LineRiskRadar, CapacityChart) stay visually in sync.

import type { RCCPLine } from '../../types'

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
  siteUtil: number | null      // Σ production / Σ available (%)
  demandCov: number | null     // Σ demand / Σ available (%)
  over: { code: string; util: number }[]        // lines ≥100% in the focus month
  short: { code: string; shortfall: number }[]  // lines with a labour shortfall
}

/** Capacity + labour verdict for a single focus month. */
export function focusVerdict(lines: RCCPLine[], period: string): FocusVerdict {
  let avail = 0, prod = 0, demand = 0
  const over: { code: string; util: number }[] = []
  const short: { code: string; shortfall: number }[] = []

  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    avail  += m.available_litres ?? 0
    prod   += m.production_litres ?? 0
    demand += m.demand_litres ?? 0
    if (m.utilisation_pct != null && m.utilisation_pct >= 100) {
      over.push({ code: l.line_code, util: m.utilisation_pct })
    }
    if (m.labour_status === 'SHORTFALL' && (m.hc_shortfall ?? 0) >= HC_MATERIAL) {
      short.push({ code: l.line_code, shortfall: m.hc_shortfall ?? 0 })
    }
  }

  const siteUtil  = avail > 0 ? Math.round((prod / avail) * 100) : null
  const demandCov = avail > 0 ? Math.round((demand / avail) * 100) : null

  let verdict: Verdict
  if (over.length > 0) verdict = 'CRITICAL'
  else if (short.length > 0 || (demandCov != null && demandCov > 100) || (siteUtil != null && siteUtil >= 90)) verdict = 'AT RISK'
  else verdict = 'ON TRACK'

  over.sort((a, b) => b.util - a.util)
  short.sort((a, b) => b.shortfall - a.shortfall)
  return { verdict, siteUtil, demandCov, over, short }
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
