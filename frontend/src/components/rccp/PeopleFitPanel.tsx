import { Users, CheckCircle2, AlertTriangle, Info, Factory, AlertCircle, UserMinus } from 'lucide-react'
import type { RCCPLine, RCCPPlantSupportRole, RCCPHcException } from '../../types'
import { C, focusMonthPeriod, monthLabel } from './brand'
import KPITile, { type KPITileTone } from './KPITile'

// "Have I got enough people to run the lines I need this month?" — the panel
// that answers that question.
//
// Units = PEOPLE (FTE), not role-hours. Two operators on the same line during
// the same shift don't create extra capacity — they fill two concurrent seats.
// So the unit of measure for headcount fit is heads, not hours.
//
// Layout: role-first. One row per role across the site; under each row, a
// per-plant breakdown showing where the gap (if any) sits. KPI tile row at
// the top: People fit verdict · Plants short · Crew short · Data missing.

interface Props {
  lines: RCCPLine[]
  plantSupport: Record<string, RCCPPlantSupportRole[]>
  planCycleDate: string
}

type RoleState = 'OK' | 'SHORT' | 'DATA_NEEDED'
type Verdict = 'OK' | 'SHORTFALL' | 'DATA_NEEDED'

// Material gap = 1 whole person. Sub-1 stays visible as a number but doesn't
// trigger a SHORT verdict (rostering noise).
const HC_MATERIAL_PEOPLE = 1

interface PlantRoleStatus {
  plant_code: string
  lines_running: number          // for line roles: how many lines contribute
  need: number                   // integer people required this month
  planned: number | null         // FTE planned (effective: standard + exceptions)
  planned_standard: number | null  // raw figure from the headcount plan (Sheet 1/2)
  exceptions: RCCPHcException[]  // events that adjusted standard → planned
  gap: number | null             // need − planned (positive = short)
  state: RoleState
  // FTE-equivalent figures (calendar-derived; based on role-hours ÷ FTE_month_hours)
  needed_role_hours: number      // for FTE conversion at the row level
  needed_fte: number | null      // needed_role_hours / fte_month_hours
}

interface RoleRow {
  role_code: string
  scope: 'LINE' | 'PLANT'
  site_need: number
  site_planned: number | null            // sum over plants with data (effective)
  site_planned_standard: number | null   // sum over plants with data (raw standard)
  site_gap: number | null                // site_need − site_planned (null if no data anywhere)
  plants: PlantRoleStatus[]
  verdict: RoleState                     // worst-of plants
  // FTE roll-ups (across plants for this role)
  site_needed_fte: number | null
}

function fmtPeople(n: number): string {
  // Whole-number people when integer; otherwise 1dp.
  return Math.abs(n - Math.round(n)) < 0.05
    ? Math.round(n).toLocaleString()
    : (Math.round(n * 10) / 10).toLocaleString()
}

function classify(need: number, planned: number | null): RoleState {
  if (need <= 0) return 'OK'
  if (planned == null) return 'DATA_NEEDED'
  return (need - planned) >= HC_MATERIAL_PEOPLE ? 'SHORT' : 'OK'
}

function buildRoleRows(
  lines: RCCPLine[],
  plantSupport: Record<string, RCCPPlantSupportRole[]>,
  period: string,
): { rows: RoleRow[]; fteMonthHours: number } {
  // Group lines by plant
  const byPlant = new Map<string, RCCPLine[]>()
  for (const l of lines) {
    if (!byPlant.has(l.plant_code)) byPlant.set(l.plant_code, [])
    byPlant.get(l.plant_code)!.push(l)
  }
  const plantCodes = Array.from(byPlant.keys()).sort()

  // Site FTE-month-hours (calendar-derived: site_working_days × shift_hours).
  // 1 FTE = one person working a standard month for this period.
  let siteWd = 0
  let shiftMins = 0
  for (const l of lines) {
    const m = l.monthly.find(x => x.period === period)
    if (!m) continue
    if (m.working_days > siteWd) siteWd = m.working_days
    const mins = l.available_mins_per_day || 420
    if (mins > shiftMins) shiftMins = mins
  }
  const fteMonthHours = (siteWd * shiftMins) / 60

  // Per-plant, per-line-role aggregations
  const lineNeed = new Map<string, Map<string, number>>()
  const lineRoleHours = new Map<string, Map<string, number>>()  // role-hours = prod_hours × req
  const linePlanned = new Map<string, Map<string, number>>()
  const linePlannedStandard = new Map<string, Map<string, number>>()
  const lineHasData = new Map<string, Set<string>>()
  const linesRunningByPlant = new Map<string, number>()
  const plantOperatingHours = new Map<string, number>()  // max line operating hours per plant
  // Per-plant exceptions, deduped (line exception_detail is keyed by line,
  // so the same event isn't repeated; per-role attribution is handled below).
  const lineExceptionsByPlantRole = new Map<string, Map<string, RCCPHcException[]>>()

  for (const plant of plantCodes) {
    lineNeed.set(plant, new Map())
    lineRoleHours.set(plant, new Map())
    linePlanned.set(plant, new Map())
    linePlannedStandard.set(plant, new Map())
    lineHasData.set(plant, new Set())
    lineExceptionsByPlantRole.set(plant, new Map())
    let running = 0
    let opHours = 0

    for (const l of byPlant.get(plant)!) {
      const m = l.monthly.find(x => x.period === period)
      const prodHours = m?.production_hours ?? 0
      const availHours = m?.available_hours ?? 0
      if (availHours > opHours) opHours = availHours
      if (prodHours <= 0) continue
      running++

      // Need: sum of per-line requirements per role + role-hours (for FTE)
      for (const r of l.hc_roles) {
        const cur = lineNeed.get(plant)!.get(r.role_code) ?? 0
        lineNeed.get(plant)!.set(r.role_code, cur + r.required)
        const curH = lineRoleHours.get(plant)!.get(r.role_code) ?? 0
        lineRoleHours.get(plant)!.set(r.role_code, curH + r.required * prodHours)
      }

      // Planned (effective) and Standard headcount per line, distributed across
      // the line's roles in proportion to each role's per-line requirement.
      const totalReq = l.hc_roles.reduce((s, r) => s + r.required, 0)
      if (m?.hc_planned_avg != null && totalReq > 0) {
        for (const r of l.hc_roles) {
          const share = m.hc_planned_avg * (r.required / totalReq)
          const cur = linePlanned.get(plant)!.get(r.role_code) ?? 0
          linePlanned.get(plant)!.set(r.role_code, cur + share)
          lineHasData.get(plant)!.add(r.role_code)
        }
      }
      if (m?.hc_planned_standard != null && totalReq > 0) {
        for (const r of l.hc_roles) {
          const share = m.hc_planned_standard * (r.required / totalReq)
          const cur = linePlannedStandard.get(plant)!.get(r.role_code) ?? 0
          linePlannedStandard.get(plant)!.set(r.role_code, cur + share)
        }
      }

      // Exceptions attached to this line — surface against the relevant role(s)
      for (const exc of m?.hc_exceptions ?? []) {
        const exRolesByPlant = lineExceptionsByPlantRole.get(plant)!
        if (exc.role) {
          const arr = exRolesByPlant.get(exc.role) ?? []
          arr.push(exc)
          exRolesByPlant.set(exc.role, arr)
        } else {
          // role-blank events apply to every line role
          for (const r of l.hc_roles) {
            const arr = exRolesByPlant.get(r.role_code) ?? []
            arr.push(exc)
            exRolesByPlant.set(r.role_code, arr)
          }
        }
      }
    }
    linesRunningByPlant.set(plant, running)
    plantOperatingHours.set(plant, opHours)
  }

  // Collect every line role seen anywhere
  const lineRoleSet = new Set<string>()
  for (const plant of plantCodes) {
    for (const role of lineNeed.get(plant)!.keys()) lineRoleSet.add(role)
  }

  // Build role rows for line roles
  const rows: RoleRow[] = []

  for (const role of lineRoleSet) {
    const plants: PlantRoleStatus[] = []
    let siteNeed = 0
    let siteHasAnyData = false
    let sitePlannedSum = 0

    for (const plant of plantCodes) {
      const need = lineNeed.get(plant)!.get(role) ?? 0
      if (need === 0) continue                  // role doesn't apply at this plant
      const planned = lineHasData.get(plant)!.has(role)
        ? linePlanned.get(plant)!.get(role) ?? 0
        : null
      const planned_standard = lineHasData.get(plant)!.has(role)
        ? linePlannedStandard.get(plant)!.get(role) ?? null
        : null
      const exceptions = lineExceptionsByPlantRole.get(plant)?.get(role) ?? []
      const gap = planned != null ? need - planned : null
      const state = classify(need, planned)
      const role_hours = lineRoleHours.get(plant)!.get(role) ?? 0
      const needed_fte = fteMonthHours > 0 ? role_hours / fteMonthHours : null

      plants.push({
        plant_code: plant,
        lines_running: linesRunningByPlant.get(plant) ?? 0,
        need,
        planned,
        planned_standard,
        exceptions,
        gap,
        state,
        needed_role_hours: role_hours,
        needed_fte,
      })

      siteNeed += need
      if (planned != null) {
        siteHasAnyData = true
        sitePlannedSum += planned
      }
    }

    if (plants.length === 0) continue

    const hasShort = plants.some(p => p.state === 'SHORT')
    const hasDataNeeded = plants.some(p => p.state === 'DATA_NEEDED')
    const verdict: RoleState = hasShort ? 'SHORT' : hasDataNeeded ? 'DATA_NEEDED' : 'OK'
    const sitePlannedStandard = plants
      .filter(p => p.planned_standard != null)
      .reduce((s, p) => s + (p.planned_standard ?? 0), 0)
    const hasStandard = plants.some(p => p.planned_standard != null)

    const totalRoleHours = plants.reduce((s, p) => s + p.needed_role_hours, 0)
    const site_needed_fte = fteMonthHours > 0 ? totalRoleHours / fteMonthHours : null

    rows.push({
      role_code: role,
      scope: 'LINE',
      site_need: siteNeed,
      site_planned: siteHasAnyData ? sitePlannedSum : null,
      site_planned_standard: hasStandard ? sitePlannedStandard : null,
      site_gap: siteHasAnyData ? siteNeed - sitePlannedSum : null,
      plants,
      verdict,
      site_needed_fte,
    })
  }

  // Plant-shared roles (forklift, materials handler, robot operator, technician)
  // For each role, walk all plants that have a requirement for it.
  const plantRoleSet = new Set<string>()
  for (const roles of Object.values(plantSupport)) {
    for (const r of roles) plantRoleSet.add(r.role_code)
  }

  for (const role of plantRoleSet) {
    const plants: PlantRoleStatus[] = []
    let siteNeed = 0
    let siteHasAnyData = false
    let sitePlannedSum = 0

    for (const plant of plantCodes) {
      const reqRow = (plantSupport[plant] ?? []).find(r => r.role_code === role)
      if (!reqRow) continue
      const running = linesRunningByPlant.get(plant) ?? 0
      const need = running > 0 ? reqRow.required : 0
      if (need === 0) continue

      const monthly = reqRow.monthly?.find(x => x.period === period)
      const planned = monthly?.hc_planned_avg ?? null
      const planned_standard = monthly?.hc_planned_standard ?? null
      const exceptions = monthly?.hc_exceptions ?? []
      const gap = planned != null ? need - planned : null
      const state = classify(need, planned)
      const opHours = plantOperatingHours.get(plant) ?? 0
      const role_hours = need * opHours
      const needed_fte = fteMonthHours > 0 ? role_hours / fteMonthHours : null

      plants.push({
        plant_code: plant,
        lines_running: running,
        need,
        planned,
        planned_standard,
        exceptions,
        gap,
        state,
        needed_role_hours: role_hours,
        needed_fte,
      })

      siteNeed += need
      if (planned != null) {
        siteHasAnyData = true
        sitePlannedSum += planned
      }
    }

    if (plants.length === 0) continue

    const hasShort = plants.some(p => p.state === 'SHORT')
    const hasDataNeeded = plants.some(p => p.state === 'DATA_NEEDED')
    const verdict: RoleState = hasShort ? 'SHORT' : hasDataNeeded ? 'DATA_NEEDED' : 'OK'

    const sitePlannedStandardP = plants
      .filter(p => p.planned_standard != null)
      .reduce((s, p) => s + (p.planned_standard ?? 0), 0)
    const hasStandardP = plants.some(p => p.planned_standard != null)

    const totalRoleHoursP = plants.reduce((s, p) => s + p.needed_role_hours, 0)
    const site_needed_fte_P = fteMonthHours > 0 ? totalRoleHoursP / fteMonthHours : null

    rows.push({
      role_code: role,
      scope: 'PLANT',
      site_need: siteNeed,
      site_planned: siteHasAnyData ? sitePlannedSum : null,
      site_planned_standard: hasStandardP ? sitePlannedStandardP : null,
      site_gap: siteHasAnyData ? siteNeed - sitePlannedSum : null,
      plants,
      verdict,
      site_needed_fte: site_needed_fte_P,
    })
  }

  // Sort: line roles first; SHORT > DATA_NEEDED > OK within scope
  const verdictRank: Record<RoleState, number> = { SHORT: 0, DATA_NEEDED: 1, OK: 2 }
  rows.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'LINE' ? -1 : 1
    if (verdictRank[a.verdict] !== verdictRank[b.verdict]) {
      return verdictRank[a.verdict] - verdictRank[b.verdict]
    }
    return a.role_code.localeCompare(b.role_code)
  })

  return { rows, fteMonthHours }
}

function plantBreakdown(plants: PlantRoleStatus[]): string {
  // Show problematic plants explicitly; collapse healthy plants into "others OK"
  const problems = plants.filter(p => p.state !== 'OK')
  const healthy = plants.filter(p => p.state === 'OK')

  const parts: string[] = []
  for (const p of problems) {
    if (p.state === 'SHORT') {
      parts.push(`${p.plant_code} short ${fmtPeople(p.gap ?? 0)}`)
    } else if (p.state === 'DATA_NEEDED') {
      parts.push(`${p.plant_code} data needed`)
    }
  }
  if (healthy.length > 0) parts.push(problems.length > 0 ? 'others OK' : 'all plants OK')
  return parts.join(' · ')
}

function plantsNeedingInput(plants: PlantRoleStatus[]): string {
  return plants.filter(p => p.state === 'DATA_NEEDED').map(p => p.plant_code).join(', ')
}

export default function PeopleFitPanel({ lines, plantSupport, planCycleDate }: Props) {
  const period = focusMonthPeriod(planCycleDate)
  const { rows: roles, fteMonthHours } = buildRoleRows(lines, plantSupport, period)

  if (roles.length === 0) return null

  // ── Top-row KPIs ──────────────────────────────────────────────────────────
  const allPlantStatuses = roles.flatMap(r => r.plants)
  const plantsRunning = new Set(allPlantStatuses.filter(p => p.lines_running > 0).map(p => p.plant_code)).size
  const plantsShort = new Set(allPlantStatuses.filter(p => p.state === 'SHORT').map(p => p.plant_code)).size

  // Crew short: sum of per-plant gaps for SHORT statuses (people; capped at 0)
  const crewShort = allPlantStatuses
    .filter(p => p.state === 'SHORT' && p.gap != null)
    .reduce((s, p) => s + Math.max(0, p.gap ?? 0), 0)
  const rolesShortCount = roles.filter(r => r.verdict === 'SHORT').length

  const dataMissing = allPlantStatuses.filter(p => p.state === 'DATA_NEEDED').length

  const siteVerdict: Verdict = plantsShort > 0 ? 'SHORTFALL' : dataMissing > 0 ? 'DATA_NEEDED' : 'OK'
  const verdictLabel = siteVerdict === 'SHORTFALL' ? 'SHORTFALL' : siteVerdict === 'DATA_NEEDED' ? 'DATA NEEDED' : 'ALL CLEAR'
  const verdictTone: KPITileTone = siteVerdict === 'SHORTFALL' ? 'warn' : siteVerdict === 'DATA_NEEDED' ? 'navy' : 'lime'
  const verdictFootnote =
    siteVerdict === 'SHORTFALL'
      ? `${rolesShortCount} role${rolesShortCount > 1 ? 's' : ''} short${dataMissing > 0 ? ` · ${dataMissing} unfunded` : ''}`
      : siteVerdict === 'DATA_NEEDED'
        ? `${dataMissing} plant role${dataMissing > 1 ? 's' : ''} unfunded`
        : 'all roles covered'

  // Verdict label colour per role chip
  const chipFor = (v: RoleState) =>
    v === 'SHORT'
      ? { icon: AlertTriangle, color: C.amber, text: 'shortfall' }
      : v === 'DATA_NEEDED'
        ? { icon: Info, color: C.navy, text: 'data needed' }
        : { icon: CheckCircle2, color: C.limeDeep, text: 'ok' }

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
            People fit · {monthLabel(period)}
          </h2>
          <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
            People required for the lines scheduled this month, vs the planned headcount. Concurrent crew counted once.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: C.ink3 }}>
          <Users className="w-3.5 h-3.5" style={{ color: C.ink4 }} />
          <span>Material gap = ≥ 1 person</span>
        </div>
      </div>

      {/* KPI tile row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KPITile
          tone={verdictTone}
          icon={Users}
          label="People fit"
          value={verdictLabel}
          footnote={verdictFootnote}
        />
        <KPITile
          tone={plantsShort > 0 ? 'warn' : 'lime'}
          icon={Factory}
          label="Plants short"
          value={plantsShort}
          footnote={`of ${plantsRunning} running`}
        />
        <KPITile
          tone={crewShort > 0 ? 'warn' : 'lime'}
          icon={UserMinus}
          label="Crew short"
          value={crewShort > 0 ? fmtPeople(crewShort) : 0}
          footnote={crewShort > 0
            ? `across ${rolesShortCount} role${rolesShortCount > 1 ? 's' : ''}`
            : 'no deficit'}
        />
        <KPITile
          tone={dataMissing > 0 ? 'navy' : 'lime'}
          icon={AlertCircle}
          label="Data missing"
          value={dataMissing}
          footnote={dataMissing > 0 ? 'confirm with manufacturing' : 'complete'}
        />
      </div>

      {/* Role-first list */}
      <div className="rounded-xl" style={{ border: `1px solid ${C.border}` }}>
        {roles.map((r, idx) => {
          const chip = chipFor(r.verdict)
          const ChipIcon = chip.icon
          const headlineNumber =
            r.verdict === 'DATA_NEEDED' && r.site_planned == null
              ? null
              : r.site_gap

          // Total exception delta for this role across all plants
          const totalExceptionDelta = r.plants
            .flatMap(p => p.exceptions)
            .reduce((s, e) => s + e.delta_prorated, 0)
          const hasExceptions = Math.abs(totalExceptionDelta) > 0.05
          const exceptionTip = hasExceptions
            ? r.plants
                .filter(p => p.exceptions.length > 0)
                .map(p => `${p.plant_code}: ` + p.exceptions
                  .map(e => `${e.reason ?? 'absence'} ${e.start}→${e.end} Δ${e.delta_prorated >= 0 ? '+' : ''}${e.delta_prorated.toFixed(2)}`)
                  .join('; '))
                .join(' | ')
            : ''

          return (
            <div
              key={`${r.scope}-${r.role_code}`}
              className="px-4 py-3"
              style={{ borderTop: idx === 0 ? 'none' : `1px solid ${C.border}` }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider"
                    style={{ color: chip.color }}
                  >
                    <ChipIcon className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </span>
                  <span className="font-semibold text-[13.5px]" style={{ color: C.navy }}>
                    {r.role_code}
                  </span>
                  {r.scope === 'PLANT' && (
                    <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: C.ink4 }}>
                      plant
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-4 font-mono tabnum text-[12.5px]" style={{ color: C.ink2 }}>
                  <span>
                    Need <span className="font-semibold" style={{ color: C.navy }}>{fmtPeople(r.site_need)}</span>
                  </span>
                  <span>
                    Planned{' '}
                    {r.site_planned == null
                      ? <span style={{ color: C.navy, fontStyle: 'italic' }}>data needed</span>
                      : (
                        <>
                          {hasExceptions && r.site_planned_standard != null && (
                            <>
                              <span style={{ color: C.ink4 }}>{fmtPeople(r.site_planned_standard)} → </span>
                            </>
                          )}
                          <span className="font-semibold" style={{ color: C.navy }}>{fmtPeople(r.site_planned)}</span>
                          {hasExceptions && (
                            <span
                              className="ml-1.5 text-[10.5px] font-mono px-1.5 py-px rounded"
                              style={{ background: C.amberLight, color: C.amber, border: `1px solid #FCD34D` }}
                              title={exceptionTip}
                            >
                              Δ{totalExceptionDelta >= 0 ? '+' : ''}{totalExceptionDelta.toFixed(1)}
                            </span>
                          )}
                        </>
                      )}
                  </span>
                  <span>
                    {headlineNumber == null
                      ? <span style={{ color: C.navy, fontStyle: 'italic' }}>—</span>
                      : headlineNumber > 0
                        ? <span className="font-semibold" style={{ color: C.amber }}>short {fmtPeople(headlineNumber)}</span>
                        : headlineNumber < 0
                          ? <span className="font-semibold" style={{ color: C.limeDeep }}>+{fmtPeople(-headlineNumber)} surplus</span>
                          : <span className="font-semibold" style={{ color: C.limeDeep }}>even</span>}
                  </span>
                </div>
              </div>

              {/* FTE-equivalent roll-up (shown when calendar data lets us compute it) */}
              {r.site_needed_fte != null && r.site_needed_fte > 0 && (
                <p className="text-[11px] mt-1 ml-[18px] font-mono tabnum" style={{ color: C.ink4 }}>
                  ≈ <span style={{ color: C.ink3 }}>{r.site_needed_fte.toFixed(1)} FTE needed</span>
                  {r.site_planned != null && (
                    <>
                      {' '}· <span style={{ color: C.ink3 }}>{r.site_planned.toFixed(1)} FTE planned</span>
                      {' '}·{' '}
                      <span style={{ color: r.site_needed_fte - r.site_planned >= 1 ? C.amber : r.site_needed_fte - r.site_planned < 0 ? C.limeDeep : C.ink3 }}>
                        {(r.site_needed_fte - r.site_planned) >= 0
                          ? `−${(r.site_needed_fte - r.site_planned).toFixed(1)} FTE`
                          : `+${(r.site_planned - r.site_needed_fte).toFixed(1)} FTE surplus`}
                      </span>
                    </>
                  )}
                </p>
              )}

              {/* Per-plant breakdown */}
              {r.verdict !== 'OK' && (
                <p className="text-[11.5px] mt-1.5 ml-[18px]" style={{ color: C.ink3 }}>
                  {r.scope === 'PLANT' && r.verdict === 'DATA_NEEDED' && r.plants.every(p => p.state !== 'SHORT')
                    ? <>Plants needing input: <span className="font-mono">{plantsNeedingInput(r.plants)}</span></>
                    : plantBreakdown(r.plants)}
                </p>
              )}

              {/* Exceptions sub-line (always shown when any) */}
              {hasExceptions && (
                <p className="text-[11px] mt-1 ml-[18px]" style={{ color: C.ink4 }}>
                  Adjustments:{' '}
                  {r.plants
                    .filter(p => p.exceptions.length > 0)
                    .map(p => {
                      const sum = p.exceptions.reduce((s, e) => s + e.delta_prorated, 0)
                      const reasons = [...new Set(p.exceptions.map(e => e.reason).filter(Boolean))].join(', ')
                      return `${p.plant_code} ${sum >= 0 ? '+' : ''}${sum.toFixed(1)}${reasons ? ` (${reasons})` : ''}`
                    })
                    .join(' · ')}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] mt-3 ml-[1px]" style={{ color: C.ink4 }}>
        Need = lines scheduled × per-line headcount (line roles) or plant headcount when any line runs (plant roles).
        Planned = the figure in the headcount plan. Concurrent crew is counted once — two operators on the same line at
        the same time count as two people, not double the hours.
        {fteMonthHours > 0 && (
          <>
            {' '}<span className="font-mono">1 FTE = {Math.round(fteMonthHours)}h this month</span> (calendar-derived). Cost / shift impact lives on Scenarios.
          </>
        )}
      </p>
    </div>
  )
}
