import type { Batch, Baseline } from '../../types'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  VALIDATING: 'bg-blue-50 text-blue-700',
  VALIDATED: 'bg-green-50 text-green-700',
  PUBLISHED: 'bg-green-100 text-green-800 font-semibold',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

interface Props {
  batch: Batch
  baseline?: Baseline | null
}

export default function BatchHeader({ batch, baseline }: Props) {
  const cycleDate = new Date(batch.plan_cycle_date + 'T00:00:00')
  const formattedDate = cycleDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Baseline / cycle status banner */}
      {baseline ? (
        <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-green-800 font-medium">
            Cycle complete — Baseline: {baseline.version_name}
            {baseline.is_active_baseline && ' (active)'}
          </span>
          <span className="text-xs text-green-600 ml-1">
            · Created {new Date(baseline.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            {baseline.created_by ? ` by ${baseline.created_by}` : ''}
          </span>
        </div>
      ) : batch.status === 'PUBLISHED' ? (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-amber-800">Published — create a baseline below to complete this cycle.</span>
        </div>
      ) : null}

      {/* Batch metadata */}
      <div className="p-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-gray-900">{batch.batch_name}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[batch.status] ?? ''}`}>
              {batch.status}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>Cycle: <span className="text-gray-700 font-medium">{formattedDate}</span></span>
            {batch.created_by && (
              <span>Owner: <span className="text-gray-700">{batch.created_by}</span></span>
            )}
            <span>Created: <span className="text-gray-700">
              {new Date(batch.created_at).toLocaleDateString('en-GB')}
            </span></span>
          </div>
        </div>
      </div>
    </div>
  )
}
