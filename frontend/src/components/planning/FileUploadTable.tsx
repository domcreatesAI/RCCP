import FileRow from './FileRow'
import type { Batch, FileType } from '../../types'

const REQUIRED_FILES: FileType[] = [
  'master_stock',
  'demand_plan',
  'line_capacity_calendar',
  'headcount_plan',
  'portfolio_changes',
]

const OPTIONAL_FILES: FileType[] = ['oee_daily']

interface Props {
  batch: Batch
}

export default function FileUploadTable({ batch }: Props) {
  const filesByType = Object.fromEntries(
    (batch.files ?? []).map((f) => [f.file_type, f])
  )

  const requiredPresent = REQUIRED_FILES.filter((ft) => filesByType[ft]).length
  const hasBlocked = (batch.files ?? []).some((f) => f.validation_status === 'BLOCKED')
  const canPublish = requiredPresent === 5 && !hasBlocked && batch.status !== 'PUBLISHED'

  const colHeaders = ['File', 'Status', 'Ver.', 'Uploaded by', 'Time', 'Actions']

  return (
    <div className="space-y-4">
      {/* Required files */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Required files (5)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              All required files must be present before validation.{' '}
              <span className="font-medium">portfolio_changes</span> accepts an empty file if no changes apply.
            </p>
          </div>
          <span className={`text-sm font-semibold ${requiredPresent === 5 ? 'text-green-600' : 'text-red-600'}`}>
            {requiredPresent}/5 present
          </span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              {colHeaders.map((h) => (
                <th key={h} className="py-2 px-4 text-left text-xs font-medium text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REQUIRED_FILES.map((ft) => (
              <FileRow
                key={ft}
                batchId={batch.batch_id}
                fileType={ft}
                file={filesByType[ft]}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Optional files */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Optional files</p>
          <p className="text-xs text-gray-500 mt-0.5">Missing optional files produce a warning, not a blocker.</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50">
              {colHeaders.map((h) => (
                <th key={h} className="py-2 px-4 text-left text-xs font-medium text-gray-500">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OPTIONAL_FILES.map((ft) => (
              <FileRow
                key={ft}
                batchId={batch.batch_id}
                fileType={ft}
                file={filesByType[ft]}
                optional
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Publish bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {batch.status === 'PUBLISHED' ? (
            <span className="text-green-600 font-medium">This batch has been published.</span>
          ) : hasBlocked ? (
            <span className="text-red-600">One or more files have BLOCKED issues — resolve before publishing.</span>
          ) : requiredPresent < 5 ? (
            <span>Upload all 5 required files before publishing.</span>
          ) : (
            <span className="text-green-600">All required files present — ready to publish.</span>
          )}
        </div>
        <button
          disabled={!canPublish}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Publish batch
        </button>
      </div>
    </div>
  )
}
