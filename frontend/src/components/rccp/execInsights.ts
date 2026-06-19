// Shared executive-summary insight helpers, used by both the slim Executive
// Summary and the comprehensive Capacity Dashboard. Pure data → no JSX.

import type { RCCPLine, RCCPPortfolioChange, RCCPPoolRoleBalance, RCCPMonthlyBucket } from '../../types'
import { focusMonthPeriod, monthLabel, rollingMonths, shortMonth, poolFteForMonth } from './brand'

export type UnitMode = 'L' | 'h'

// ─── Action items ───────────────────────────────────────────────────────────────
export type ActionCategory = 'CAPACITY' | 'LABOUR' | 'PORTFOLIO'
export type ActionSeverity = 'critical' | 'high' | 'info'

export interface ActionItem {
  id: string
  category: ActionCategory
  severity: ActionSeverity
  period: string                 // YYYY-MM, or '' for cross-horizon
  title: string
  detail: string
  cost?: number                  // £, when relevant
}

export const COGS_PER_LITRE = 0.12      // matches the engine default; cost is illustrative

export function actionsKey(batchId: number) {
  return `rccp_actions_v2_${batchId}`
}

export function loadActionStatus(batchId: number): Record<string, 'done' | 'pending'> {
  try {
    const raw = localStorage.getItem(actionsKey(batchId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveActionStatus(batchId: number, s: Record<string, 'done' | 'pending'>) {
  try { localStorage.setItem(actionsKey(batchId), JSON.stringify(s)) } catch { /* ignore */ }
}

export function fmtGBP(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `£${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `£${(v / 1_000).toFixed(0)}k`
  return `£${Math.round(v)}`
}

export function buildActionItems(
  lines: RCCPLine[],
  portfolioChanges: RCCPPortfolioChange[],
  planCycleDate: string,
  poolLabour: Record<string, RCCPPoolRoleBalance[]>,
): ActionItem[] {
  const items: ActionItem[] = []
  const focus = focusMonthPeriod(planCycleDate)
  const horizon = rollingMonths(planCycleDate, 12)
  const horizonSet = new Set(horizon)

  // 1. Capacity actions — every line × month with util > 100% in the next 12.
  for (const l of lines) {
    const overs = l.monthly
      .filter(m => horizonSet.has(m.period) && m.utilisation_pct != null && m.utilisation_pct > 100)
      .sort((a, b) => (b.utilisation_pct ?? 0) - (a.utilisation_pct ?? 0))
    if (overs.length === 0) continue
    const worst = overs[0]
    const extraLitres = Math.max(0, (worst.production_litres ?? 0) - (worst.available_litres ?? 0))
    const av = worst.available_litres ?? 0
    const ah = worst.available_hours ?? 0
    const extraHours = av > 0 && ah > 0 ? Math.round((extraLitres / av) * ah) : 0
    const cost = extraLitres * COGS_PER_LITRE
    const months = overs.length > 1 ? ` (+${overs.length - 1} more month${overs.length > 2 ? 's' : ''})` : ''
    items.push({
      id: `cap_${l.line_code}_${worst.period}`,
      category: 'CAPACITY',
      severity: (worst.utilisation_pct ?? 0) > 115 ? 'critical' : 'high',
      period: worst.period,
      title: `Approve extra hours on ${l.line_code} — ${monthLabel(worst.period)}`,
      detail: `Order book at ${Math.round(worst.utilisation_pct ?? 0)}% · need +${extraHours}h to clear${months}`,
      cost,
    })
  }

  // 2. Labour actions — pools short of crew to meet the focus month's demand.
  for (const s of poolFteForMonth(poolLabour, focus).shortItems) {
    const poolLabel = s.pool.replace(/^POOL-/, '')
    items.push({
      id: `lab_${s.pool}_${s.role}_${focus}`,
      category: 'LABOUR',
      severity: 'high',
      period: focus,
      title: `${poolLabel}: ${s.gap.toFixed(1)} FTE short on ${s.role.replace(/_/g, ' ').toLowerCase()} — ${monthLabel(focus)}`,
      detail: `Pool can't cover the demand-driven crew need this month. Add cover, approve overtime, or reprofile the load.`,
    })
  }

  // 3. Portfolio actions — new launches landing in the next 3 months.
  const next3Set = new Set(rollingMonths(planCycleDate, 3))
  for (const pc of portfolioChanges) {
    if (pc.change_type === 'DISCONTINUE') continue
    if (!pc.effective_period || !next3Set.has(pc.effective_period)) continue
    items.push({
      id: `pf_${pc.item_code ?? '?'}_${pc.effective_period}`,
      category: 'PORTFOLIO',
      severity: 'info',
      period: pc.effective_period,
      title: `Confirm capacity for ${pc.item_code ?? 'new SKU'} — launching ${monthLabel(pc.effective_period)}`,
      detail: pc.line_code
        ? `Routing line ${pc.line_code}. Volume flows through S&OP → MRP — sanity-check the line's load that month.`
        : `No routing line yet — set up the SKU in masterdata before the launch month.`,
    })
  }

  const sevRank: Record<ActionSeverity, number> = { critical: 0, high: 1, info: 2 }
  items.sort((a, b) => {
    if (a.period !== b.period) return a.period.localeCompare(b.period)
    return sevRank[a.severity] - sevRank[b.severity]
  })
  return items
}

// ─── Headline (Capacity Dashboard hero numbers) ─────────────────────────────────
export interface Headline {
  planFeasibility: number | null
  deliverableLitres: number
  shortfallLitres: number
  productionTotal: number
  siteUtilTheoretical: number | null
  theoreticalCapacity: number | null
  demandTotal: number
  demandCoverage: number | null
  criticalLines: number
  highLines: number
  linesAtRisk: number
  labourShortfalls: number
}

export function buildHeadline(
  lines: RCCPLine[],
  periods: string[],
  poolLabour: Record<string, RCCPPoolRoleBalance[]>,
): Headline {
  const periodSet = new Set(periods)
  let prod = 0, availSum = 0, dem = 0
  let deliverable = 0, shortfall = 0
  let anyAvail = false

  for (const l of lines) {
    for (const m of l.monthly) {
      if (!periodSet.has(m.period)) continue
      const a = m.available_litres ?? 0
      const p = m.production_litres ?? 0
      const d = m.demand_litres ?? 0
      if (m.available_litres != null) { anyAvail = true; availSum += a }
      prod += p
      dem  += d
      if (m.available_litres != null && p > 0) {
        deliverable += Math.min(p, a)
        shortfall   += Math.max(0, p - a)
      } else {
        deliverable += p
      }
    }
  }

  const planFeasibility = prod > 0 ? Math.round((deliverable / prod) * 100) : null
  const siteUtilTheoretical = anyAvail && availSum > 0 ? Math.round((prod / availSum) * 100) : null
  const demandCoverage = anyAvail && availSum > 0 ? Math.round((dem / availSum) * 100) : null

  const criticalLines = lines.filter(l => l.risk_status === 'Critical').length
  const highLines = lines.filter(l => l.risk_status === 'High').length
  const labourShortfalls = poolFteForMonth(poolLabour, periods[0]).shortItems.length

  return {
    planFeasibility,
    deliverableLitres: deliverable,
    shortfallLitres: shortfall,
    productionTotal: prod,
    siteUtilTheoretical,
    theoreticalCapacity: anyAvail ? availSum : null,
    demandTotal: dem,
    demandCoverage,
    criticalLines,
    highLines,
    linesAtRisk: criticalLines + highLines,
    labourShortfalls,
  }
}

// ─── Slim Exec Summary KPIs (unit-aware: MRP load = firm + planned vs capacity) ──
export type ExecVerdict = 'ON_PLAN' | 'AT_RISK' | 'ACTION'

export interface ExecKpis {
  linesOver: number
  overMonthsLabel: string | null
  planFeasibilityPct: number | null   // share of planned load that fits within capacity
  siteUtilPct: number | null
  peakUtilPct: number | null
  peakUtilMonth: string | null
  poolsShort: number
  fteGap: number
  poolShortFrom: string | null
  phaseInCount: number
  phaseInVolume: number          // in the active unit
  phaseInFrom: string | null
  verdict: ExecVerdict
}

// Plan load (firm YPAC + MRP LA) and capacity for a bucket, in the active unit.
export function planAndCap(m: RCCPMonthlyBucket, unit: UnitMode): { plan: number; cap: number | null } {
  if (unit === 'h') {
    return { plan: (m.firm_hours ?? 0) + (m.planned_hours ?? 0), cap: m.available_hours }
  }
  return { plan: m.firm_litres + m.planned_litres, cap: m.available_litres }
}

function monthRangeLabel(periods: Set<string>): string | null {
  if (periods.size === 0) return null
  const sorted = Array.from(periods).sort()
  const a = shortMonth(sorted[0])
  if (sorted.length === 1) return a
  return `${a}–${shortMonth(sorted[sorted.length - 1])}`
}

export function buildExecKpis(
  lines: RCCPLine[],
  periods: string[],
  unit: UnitMode,
  poolLabour: Record<string, RCCPPoolRoleBalance[]>,
  portfolioChanges: RCCPPortfolioChange[],
): ExecKpis {
  const set = new Set(periods)
  let planSum = 0, capSum = 0, deliverable = 0, anyCap = false
  const monthPlan: Record<string, number> = {}
  const monthCap: Record<string, number> = {}
  const overMonths = new Set<string>()
  const linesOver = new Set<string>()

  for (const l of lines) {
    for (const m of l.monthly) {
      if (!set.has(m.period)) continue
      const { plan, cap } = planAndCap(m, unit)
      planSum += plan
      monthPlan[m.period] = (monthPlan[m.period] ?? 0) + plan
      if (cap != null) {
        anyCap = true; capSum += cap
        deliverable += Math.min(plan, cap)        // capped per line × month
        monthCap[m.period] = (monthCap[m.period] ?? 0) + cap
        if (plan > cap) { overMonths.add(m.period); linesOver.add(l.line_code) }
      } else {
        deliverable += plan                        // no capacity data → assume deliverable
      }
    }
  }

  const siteUtilPct = anyCap && capSum > 0 ? Math.round((planSum / capSum) * 100) : null
  const planFeasibilityPct = planSum > 0 ? Math.round((deliverable / planSum) * 100) : null
  let peakUtilPct: number | null = null, peakUtilMonth: string | null = null
  for (const p of periods) {
    const c = monthCap[p]
    if (c && c > 0) {
      const u = Math.round(((monthPlan[p] ?? 0) / c) * 100)
      if (peakUtilPct == null || u > peakUtilPct) { peakUtilPct = u; peakUtilMonth = p }
    }
  }

  // People — pools short across the horizon
  const shortPools = new Set<string>()
  let peakGap = 0, poolShortFrom: string | null = null
  for (const p of periods) {
    const s = poolFteForMonth(poolLabour, p)
    if (s.shortItems.length) {
      for (const it of s.shortItems) shortPools.add(it.pool)
      const tot = s.shortItems.reduce((a, b) => a + b.gap, 0)
      if (tot > peakGap) peakGap = tot
      if (!poolShortFrom) poolShortFrom = p
    }
  }

  // What's changing — phase-ins (exclude legacy DISCONTINUE)
  const pins = portfolioChanges.filter(c => c.change_type !== 'DISCONTINUE')
  let phaseInVolume = 0, phaseInFrom: string | null = null
  for (const c of pins) {
    for (const p of periods) {
      const mm = c.monthly?.[p]
      if (mm) phaseInVolume += unit === 'h' ? (mm.hours ?? 0) : mm.litres
    }
    if (c.effective_period && (!phaseInFrom || c.effective_period < phaseInFrom)) phaseInFrom = c.effective_period
  }

  const verdict: ExecVerdict =
    (linesOver.size > 0 || shortPools.size > 0) ? 'ACTION'
    : (peakUtilPct != null && peakUtilPct >= 90) ? 'AT_RISK'
    : 'ON_PLAN'

  return {
    linesOver: linesOver.size,
    overMonthsLabel: monthRangeLabel(overMonths),
    planFeasibilityPct,
    siteUtilPct,
    peakUtilPct,
    peakUtilMonth,
    poolsShort: shortPools.size,
    fteGap: Math.round(peakGap * 10) / 10,
    poolShortFrom,
    phaseInCount: pins.length,
    phaseInVolume,
    phaseInFrom,
    verdict,
  }
}
