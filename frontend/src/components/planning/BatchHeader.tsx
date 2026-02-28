import type { Batch } from '../../types'

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  VALIDATING: 'bg-blue-50 text-blue-700',
  VALIDATED: 'bg-green-50 text-green-700',
  PUBLISHED: 'bg-green-100 text-green-800 font-semibold',
  ARCHIVED: 'bg-gray-100 text-gray-400',
}

interface Props {
  batch: Batch
}

export default function BatchHeader({ batch }: Props) {
  const cycleDate = new Date(batch.plan_cycle_date + 'T00:00:00')
  const formattedDate = cycleDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between">
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
  )
}
