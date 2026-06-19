import { Fragment } from 'react'
import { Users, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { RCCPPoolRoleBalance, RCCPPoolInfo } from '../../types'
import { C, monthLabel } from './brand'

// Pool labour balance (Phase 2). Per labour pool, per role: the demand-driven
// FTE need vs the people actually in the pool, with the staffing gap. Answers
// "can this pool meet the month's demand by shifting people between lines?".
//
// Two views (toggle in the header):
//   • Planning month — three cards (flex line crew / site-wide shared crew / Plant 2).
//   • 12 months      — a gap heatmap (role × month). Crew is flat, demand varies,
//                      so the heatmap shows WHEN each role tips into the red.

// Roles held as a single site-wide shared resource — pulled into their own group.
// Robot operators / technicians stay with their plant (plant-specific, not shared).
const SITE_SHARED = ['FORKLIFT_DRIVER', 'MATERIAL_HANDLER'] as const
const SITE_SHARED_SET = new Set<string>(SITE_SHARED)

const ROLE_LABEL: Record<string, string> = {
  LINE_OPERATOR: 'Line operators',
  LINE_LEADER: 'Line leaders',
  PALLETISING_OPERATOR: 'Palletising operators',
  FORKLIFT_DRIVER: 'Forklift drivers',
  MATERIAL_HANDLER: 'Material handlers',
  ROBOT_OPERATOR: 'Robot operators',
  TECHNICIAN: 'Technicians',
}
const roleLabel = (code: string) =>
  ROLE_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const shortMonth = (period: string) => MON[parseInt(period.slice(5, 7), 10) - 1] ?? period
const isYearStart = (period: string) => period.slice(5, 7) === '01'

type RolePeak = {
  period: string
  need: number
  have: number | null
  gap: number | null
  dataNeeded: boolean
}

// Per-role series across the horizon, plus the (flat) crew you hold.
type RoleSeries = { role_code: string; have: number | null; peaks: RolePeak[] }

type Group = {
  key: string
  title: string
  subtitle: string | null
  concurrency: { lines: number; bindingRole: string | null } | null
  roles: RoleSeries[]
}

function roleFocus(role: RCCPPoolRoleBalance, period: string): RolePeak {
  const m = role.monthly[period]
  if (!m) return { period, need: 0, have: null, gap: null, dataNeeded: true }
  return { period, need: m.need, have: m.have, gap: m.gap, dataNeeded: m.have == null }
}

// Show whole numbers cleanly, fractions to 1dp (e.g. 0.4 not 0).
function fmtHc(v: number | null): string {
  if (v == null) return '—'
  return Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)
}

type Verdict = 'OK' | 'SHORTFALL' | 'DATA_NEEDED'

function gapTone(p: RolePeak) {
  if (p.dataNeeded || p.gap == null) return { fg: C.navy, bg: C.navyTint }
  if (p.need > 0 && p.have === 0) return { fg: C.red, bg: C.redLight }   // none of a needed role → can't run
  if (p.gap >= 0.05) return { fg: C.amber, bg: C.amberLight }            // short, but some cover → amber
  return { fg: C.limeDeep, bg: C.limeTint }                              // covered = ok
}

function verdictOf(peaks: RolePeak[]): Verdict {
  if (peaks.some((p) => !p.dataNeeded && p.gap != null && p.gap >= 0.05)) return 'SHORTFALL'
  if (peaks.some((p) => p.dataNeeded)) return 'DATA_NEEDED'
  return 'OK'
}

function chipOf(verdict: Verdict) {
  return verdict === 'SHORTFALL'
    ? { icon: AlertTriangle, text: 'shortfall', fg: C.red, bg: C.redLight }
    : verdict === 'DATA_NEEDED'
    ? { icon: Info, text: 'pool data needed', fg: C.navy, bg: C.navyTint }
    : { icon: CheckCircle2, text: 'within pool', fg: C.limeDeep, bg: C.limeTint }
}

// ── Build the display groups (flex line crew → shared crew → other pools) ──────
function buildGroups(
  poolLabour: Record<string, RCCPPoolRoleBalance[]>,
  poolInfo: Record<string, RCCPPoolInfo>,
  periods: string[],
): Group[] {
  const pools = Object.keys(poolLabour ?? {}).sort()

  const poolGroup = (poolCode: string): Group => {
    const roles: RoleSeries[] = (poolLabour[poolCode] ?? [])
      .filter((r) => !SITE_SHARED_SET.has(r.role_code))
      .map((r) => {
        const peaks = periods.map((p) => roleFocus(r, p))
        return { role_code: r.role_code, have: peaks[0]?.have ?? null, peaks }
      })
    const info = poolInfo?.[poolCode]
    const subtitle = info?.plants?.length
      ? `Plants ${info.plants.map((p) => p.replace(/^Plant /, '')).join('/')}`
      : null
    const concurrency =
      info?.max_concurrent_lines_by_labour != null
        ? { lines: info.max_concurrent_lines_by_labour, bindingRole: info.binding_role ?? null }
        : null
    return { key: poolCode, title: info?.pool_name ?? poolCode, subtitle, concurrency, roles }
  }

  // Site-wide shared crew: forklift + material handler, aggregated per month
  // across every pool that carries them (today only the flex pool does).
  const sharedGroup = (): Group | null => {
    const roles: RoleSeries[] = []
    for (const code of SITE_SHARED) {
      let present = false
      const peaks: RolePeak[] = periods.map((period) => {
        let need = 0
        let have = 0
        let gap = 0
        let haveSeen = false
        for (const list of Object.values(poolLabour ?? {})) {
          const r = list.find((x) => x.role_code === code)
          if (!r) continue
          present = true
          const p = roleFocus(r, period)
          need += p.need
          if (p.have != null) { have += p.have; haveSeen = true }
          if (p.gap != null) gap += p.gap
        }
        return {
          period,
          need,
          have: haveSeen ? have : null,
          gap: haveSeen ? gap : null,
          dataNeeded: !haveSeen,
        }
      })
      if (present) roles.push({ role_code: code, have: peaks[0]?.have ?? null, peaks })
    }
    if (roles.length === 0) return null
    return { key: 'SHARED', title: 'Shared Crew', subtitle: 'serves all plants', concurrency: null, roles }
  }

  const groups: Group[] = []
  if (pools.length) groups.push(poolGroup(pools[0]))
  const shared = sharedGroup()
  if (shared) groups.push(shared)
  for (const p of pools.slice(1)) groups.push(poolGroup(p))
  return groups
}

// ── Planning-month card (single period) ────────────────────────────────────────
function CrewCard({ group }: { group: Group }) {
  const { concurrency } = group
  const rows = group.roles.map((r) => ({ role_code: r.role_code, peak: r.peaks[0] }))
  const peaks = rows.map((r) => r.peak)
  const totNeed = peaks.reduce((s, p) => s + p.need, 0)
  const haveVals = peaks.filter((p) => p.have != null)
  const totHave = haveVals.length ? haveVals.reduce((s, p) => s + (p.have ?? 0), 0) : null
  const gapVals = peaks.filter((p) => p.gap != null)
  const totGap = gapVals.length ? gapVals.reduce((s, p) => s + (p.gap ?? 0), 0) : null
  const chip = chipOf(verdictOf(peaks))
  const ChipIcon = chip.icon

  return (
    <div className="rounded-xl px-4 py-3" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13.5px] font-semibold" style={{ color: C.navy }}>
          {group.title}
          {group.subtitle && (
            <span className="text-[11px] font-normal ml-1.5" style={{ color: C.ink3 }}>· {group.subtitle}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded"
          style={{ color: chip.fg, background: chip.bg }}>
          <ChipIcon className="w-3 h-3" /> {chip.text}
        </span>
      </div>
      {concurrency ? (
        <div className="text-[11.5px] mb-2" style={{ color: C.ink3 }}>
          ≈ <span className="font-semibold" style={{ color: C.navy }}>{concurrency.lines}</span> lines you can run
          {concurrency.bindingRole ? <span> · limited by {roleLabel(concurrency.bindingRole).toLowerCase()}</span> : null}
        </div>
      ) : (
        <div className="text-[11.5px] mb-2" style={{ color: C.ink4 }}>Site-wide support · shared across all plants</div>
      )}
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ color: C.ink3 }}>
            <th className="text-left font-medium pb-1">Role</th>
            <th className="text-right font-medium pb-1">Need</th>
            <th className="text-right font-medium pb-1">Have</th>
            <th className="text-right font-medium pb-1">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ role_code, peak }, i) => {
            const tone = gapTone(peak)
            return (
              <tr key={role_code} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                <td className="py-1" style={{ color: C.ink2 }}>{roleLabel(role_code)}</td>
                <td className="py-1 text-right" style={{ color: C.ink2 }}>{peak.need.toFixed(1)}</td>
                <td className="py-1 text-right" style={{ color: peak.have == null ? C.ink4 : C.ink2 }}>
                  {fmtHc(peak.have)}
                </td>
                <td className="py-1 text-right">
                  <span className="font-semibold px-1.5 py-0.5 rounded" style={{ color: tone.fg, background: tone.bg }}>
                    {peak.dataNeeded || peak.gap == null
                      ? 'data?'
                      : peak.gap >= 0.05 ? `−${peak.gap.toFixed(1)}` : 'ok'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: `2px solid ${C.border2}` }}>
            <td className="py-1.5 font-semibold" style={{ color: C.navy }}>Total</td>
            <td className="py-1.5 text-right font-semibold" style={{ color: C.navy }}>{totNeed.toFixed(1)}</td>
            <td className="py-1.5 text-right font-semibold" style={{ color: totHave == null ? C.ink4 : C.navy }}>
              {fmtHc(totHave)}
            </td>
            <td className="py-1.5 text-right">
              <span className="font-semibold px-1.5 py-0.5 rounded"
                style={totGap == null
                  ? { color: C.ink4 }
                  : totGap >= 1 ? { color: C.red, background: C.redLight }
                  : totGap >= 0.05 ? { color: C.amber, background: C.amberLight }
                  : { color: C.limeDeep, background: C.limeTint }}>
                {totGap == null ? '—' : totGap >= 0.05 ? `−${totGap.toFixed(1)}` : 'ok'}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── 12-month gap heatmap (role × month) ─────────────────────────────────────────
function heatCellText(p: RolePeak): string {
  if (p.dataNeeded || p.gap == null) return '?'
  return p.need.toFixed(1)                         // FTE need this month; colour shows cover vs the flat Have
}

// Single shared table so every section's months line up. Group-header bands
// separate the pools; cells are filled tiles (a solid heat band, minimal gaps).
function HeatMatrix({ groups, periods }: { groups: Group[]; periods: string[] }) {
  return (
    <div className="rounded-xl overflow-x-auto" style={{ border: `1px solid ${C.border}` }}>
      <table className="w-full text-[11px]" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 160 }} />
          <col style={{ width: 44 }} />
          {periods.map((p) => <col key={p} />)}
        </colgroup>
        <thead>
          <tr style={{ color: C.ink3, background: '#FAFAF9' }}>
            <th className="text-left font-medium py-1.5 px-3 whitespace-nowrap">Role</th>
            <th className="text-right font-medium py-1.5 px-1 whitespace-nowrap">Have</th>
            {periods.map((p) => (
              <th key={p} className="text-center font-medium py-1.5 px-0.5 whitespace-nowrap"
                style={{ borderLeft: isYearStart(p) ? `1px solid ${C.border2}` : 'none' }}>
                {isYearStart(p) ? `${shortMonth(p)} '${p.slice(2, 4)}` : shortMonth(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            const chip = chipOf(verdictOf(g.roles.flatMap((r) => r.peaks)))
            const ChipIcon = chip.icon
            return (
              <Fragment key={g.key}>
                <tr>
                  <td colSpan={2 + periods.length} className="px-3 py-1.5"
                    style={{ background: '#F4F6F7', borderTop: gi === 0 ? 'none' : `1px solid ${C.border}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold" style={{ color: C.navy }}>
                        {g.title}
                        {g.subtitle && <span className="text-[10.5px] font-normal ml-1.5" style={{ color: C.ink3 }}>· {g.subtitle}</span>}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded"
                        style={{ color: chip.fg, background: chip.bg }}>
                        <ChipIcon className="w-3 h-3" /> {chip.text}
                      </span>
                    </div>
                  </td>
                </tr>
                {g.roles.map((r) => (
                  <tr key={r.role_code}>
                    <td className="px-3 py-0.5 truncate" style={{ color: C.ink2 }}>{roleLabel(r.role_code)}</td>
                    <td className="px-1 py-0.5 text-right whitespace-nowrap" style={{ color: r.have == null ? C.ink4 : C.ink2 }}>
                      {fmtHc(r.have)}
                    </td>
                    {r.peaks.map((p, i) => {
                      const tone = gapTone(p)
                      return (
                        <td key={periods[i]} className="px-0.5 py-0.5"
                          style={{ borderLeft: isYearStart(p.period) ? `1px solid ${C.border2}` : 'none' }}>
                          <div className="rounded text-[10px] font-semibold text-center py-1"
                            style={{ background: tone.bg, color: tone.fg }}
                            title={`${shortMonth(p.period)}: need ${p.need.toFixed(1)}, have ${fmtHc(p.have)}`}>
                            {heatCellText(p)}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function PoolLabourPanel({
  poolLabour,
  poolInfo,
  horizon,
}: {
  poolLabour: Record<string, RCCPPoolRoleBalance[]>
  poolInfo: Record<string, RCCPPoolInfo>
  horizon: string[]
}) {
  const periods = horizon.slice(0, 12)
  const monthPeriod = periods[0] ?? ''
  const focusLabel = monthPeriod ? monthLabel(monthPeriod) : ''
  const rangeLabel =
    periods.length > 1 ? `${shortMonth(periods[0])} '${periods[0].slice(2, 4)} – ${shortMonth(periods[periods.length - 1])} '${periods[periods.length - 1].slice(2, 4)}` : focusLabel

  const monthGroups = buildGroups(poolLabour, poolInfo, [monthPeriod])
  const yearGroups = buildGroups(poolLabour, poolInfo, periods)

  const sectionLabel = (text: string) => (
    <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.ink4 }}>{text}</div>
  )

  return (
    <div className="bg-white rounded-2xl px-5 py-5 print-avoid-break" style={{ border: `1px solid ${C.border}`, pageBreakInside: 'avoid' }}>
      <div className="mb-3">
        <h2 className="text-[16px] font-semibold flex items-center gap-2.5" style={{ color: C.navy, letterSpacing: '-0.018em' }}>
          <span className="inline-block rounded" style={{ width: 3, height: 18, background: C.lime }} />
          Staffing feasibility (labour pools)
        </h2>
        <p className="text-[12px] mt-1 ml-[13px]" style={{ color: C.ink3 }}>
          Crew need vs people in each pool. Line roles: Σ crew × utilisation; the Shared Crew (forklift, material handler) is a flat site requirement when any plant runs.
        </p>
      </div>

      {monthGroups.length === 0 ? (
        <div className="flex items-center gap-3 py-6 px-4 rounded-xl" style={{ background: '#FAFAF9', border: `1px dashed ${C.border2}` }}>
          <Users className="w-5 h-5" style={{ color: C.ink4 }} />
          <p className="text-[13px]" style={{ color: C.ink3 }}>No line requirements configured — nothing to balance.</p>
        </div>
      ) : (
        <>
          {/* Planning month — the cycle month detail */}
          <div className="mb-2 ml-[13px]">
            {sectionLabel(`Planning month${focusLabel ? ` · ${focusLabel}` : ''}`)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {monthGroups.map((g) => <CrewCard key={g.key} group={g} />)}
          </div>

          {/* Next 12 months — the demand-driven trajectory against flat crew */}
          <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="mb-2 ml-[13px]">
              {sectionLabel(`Next 12 months${periods.length > 1 ? ` · ${rangeLabel}` : ''}`)}
              <p className="text-[11.5px] mt-0.5" style={{ color: C.ink3 }}>
                FTE need each month against the crew you hold (flat). Cells show need; colour shows cover.
              </p>
            </div>
            <HeatMatrix groups={yearGroups} periods={periods} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mt-2" style={{ color: C.ink3 }}>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: C.limeTint }} /> covered</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: C.amberLight }} /> short of cover</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: C.redLight }} /> needed role with nobody — can't run</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: C.navyTint }} /> no pool headcount entered</span>
            </div>
          </div>
        </>
      )}

      <p className="text-[11px] mt-3" style={{ color: C.ink4 }}>
        "Have" is the pool headcount you maintain (Pool Headcount sheet) minus absences. Crew is held flat month-to-month,
        so the heatmap shows when demand pushes a role short. A role short of cover is amber; a needed role with nobody
        (have 0) is red — can't run. "?" means no pool headcount entered yet — the signal to raise staffing with the business.
      </p>
    </div>
  )
}
