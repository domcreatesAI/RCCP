import type { RCCPPlantSupportRole } from '../../types'

interface Props {
  plantCode: string
  roles: RCCPPlantSupportRole[]
  visiblePeriods: string[]
}

function shortPeriod(p: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const month = parseInt(p.split('-')[1]) - 1
  return months[month] ?? p
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function PlantSupportPanel({ plantCode, roles, visiblePeriods }: Props) {
  if (!roles.length) return null

  const hasAnyPlan = roles.some(r =>
    r.monthly.some(m => visiblePeriods.includes(m.period) && m.hc_planned_avg !== null)
  )

  return (
    <div className="px-4 pb-4 space-y-2">
      {/* Title */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-violet-700">Plant {plantCode} Support</span>
        <span className="text-[11px] text-gray-400">shared roles across all lines</span>
      </div>

      {hasAnyPlan ? (
        <div className="overflow-x-auto">
          <table className="text-xs w-full min-w-max">
            <thead>
              <tr>
                <td className="py-0.5 pr-4 text-gray-400 font-semibold w-40" />
                {visiblePeriods.map(p => (
                  <td key={p} className="py-0.5 px-2 text-center text-gray-400 font-semibold whitespace-nowrap">
                    {shortPeriod(p)}
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map(role => {
                const visible = role.monthly.filter(m => visiblePeriods.includes(m.period))
                return (
                  <tr key={role.role_code}>
                    <td className="py-0.5 pr-4 text-gray-600 whitespace-nowrap">
                      {formatRole(role.role_code)}
                      <span className="text-gray-400 font-normal ml-1">({role.required} req)</span>
                    </td>
                    {visible.map(m => {
                      const val = m.hc_planned_avg
                      const shortfall = m.hc_shortfall
                      const isShort = shortfall !== null && shortfall > 0
                      return (
                        <td
                          key={m.period}
                          className={`py-0.5 px-2 text-center tabular-nums font-semibold ${
                            val === null ? 'text-gray-300' :
                            isShort ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                          {val === null ? '—' : isShort ? `⚠ ${val}` : `✓ ${val}`}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          No plant support headcount plan uploaded.
          Add a "Plant Support" sheet to the headcount_plan.xlsx file.
        </p>
      )}
    </div>
  )
}
