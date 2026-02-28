import type { Batch } from '../../types'

const STAGES = [
  { num: 1, name: 'Required File Check' },
  { num: 2, name: 'Template Structure Check' },
  { num: 3, name: 'Field Mapping Check' },
  { num: 4, name: 'Data Type Check' },
  { num: 5, name: 'Reference Check' },
  { num: 6, name: 'Business Rule Check' },
  { num: 7, name: 'Batch Readiness' },
]

function deriveStageStatus(batch: Batch, stageNum: number) {
  const files = batch.files ?? []
  if (files.length === 0) return 'pending'

  const hasBlocked = files.some((f) => f.blocked_count && f.blocked_count > 0)
  const hasWarning = files.some((f) => f.warning_count && f.warning_count > 0)
  const requiredPresent = files.filter((f) =>
    ['master_stock', 'demand_plan', 'line_capacity_calendar', 'staffing_plan', 'portfolio_changes']
      .includes(f.file_type)
  ).length

  if (stageNum === 1) {
    return requiredPresent === 5 ? 'pass' : requiredPresent > 0 ? 'warning' : 'pending'
  }
  if (stageNum === 7) {
    if (hasBlocked) return 'blocked'
    if (requiredPresent < 5) return 'warning'
    return 'pass'
  }
  if (hasBlocked) return 'blocked'
  if (hasWarning) return 'warning'
  return files.some((f) => f.validation_status === 'PASS') ? 'pass' : 'pending'
}

const STAGE_ICON = {
  pass: (
    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  blocked: (
    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  pending: (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
    </svg>
  ),
}

const STATUS_LABEL = {
  pass: <span className="text-xs text-green-600 font-medium">Pass</span>,
  warning: <span className="text-xs text-amber-600 font-medium">Warning</span>,
  blocked: <span className="text-xs text-red-600 font-medium">Blocked</span>,
  pending: <span className="text-xs text-gray-400">Pending</span>,
}

interface Props {
  batch: Batch
}

export default function ValidationPanel({ batch }: Props) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-fit">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">Validation Process</p>
        <p className="text-xs text-gray-500 mt-0.5">7-stage batch validation</p>
      </div>

      {/* portfolio_changes rule note */}
      <div className="mx-4 mt-3 mb-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">portfolio_changes rule:</span> This file is required in
          every batch, but the file may contain zero data rows if no portfolio changes apply to this
          cycle. A missing file blocks the batch; an empty but valid file does not.
        </p>
      </div>

      <div className="px-4 pb-4 mt-2 space-y-1">
        {STAGES.map((stage) => {
          const status = deriveStageStatus(batch, stage.num)
          return (
            <div
              key={stage.num}
              className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center gap-2.5">
                <div className="shrink-0">{STAGE_ICON[status]}</div>
                <div>
                  <p className="text-xs text-gray-400 leading-none">{stage.num}.</p>
                  <p className="text-sm text-gray-700">{stage.name}</p>
                </div>
              </div>
              {STATUS_LABEL[status]}
            </div>
          )
        })}
      </div>
    </div>
  )
}
